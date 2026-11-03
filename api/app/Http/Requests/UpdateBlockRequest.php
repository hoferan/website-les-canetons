<?php

namespace App\Http\Requests;

use App\Support\BlockShape;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

/**
 * One content block's data. Null puts the page's default back.
 */
class UpdateBlockRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // `present`, not `required`: `required` rejects the null that resets
        // the block, and a body without `data` must not reset it by accident.
        return [
            /**
             * The block's content as an object, or null for the page's default.
             *
             * @var array<string, mixed>|null
             */
            'data' => ['present', 'nullable', 'array', function (string $attribute, mixed $value, Closure $fail): void {
                $problem = BlockShape::check($value);
                if ($problem !== null) {
                    $fail($problem);
                }
            }],
        ];
    }

    /** @return array<string, mixed>|null */
    public function blockData(): ?array
    {
        $data = $this->validated('data');

        return is_array($data) ? $data : null;
    }
}
