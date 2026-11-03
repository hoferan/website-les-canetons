<?php

namespace App\Http\Requests;

use App\Support\BlockShape;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

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
            'data' => ['present', 'nullable', 'array'],
        ];
    }

    /**
     * The block's limits, added as a bare token so the client reads it as
     * the reason. A closure rule would not do: ApiError reports any failed
     * closure as `invalid_format`.
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                $data = $this->input('data');
                $problem = $data === null ? null : BlockShape::check($data);
                if ($problem !== null) {
                    $validator->errors()->add('data', $problem);
                }
            },
        ];
    }

    /** @return array<string, mixed>|null */
    public function blockData(): ?array
    {
        $data = $this->validated('data');

        return is_array($data) ? $data : null;
    }
}
