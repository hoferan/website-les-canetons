<?php

namespace App\Validation;

use ReflectionClass;

final class Validator
{
    /** @return array<int, array{field: string, reason: string, params?: array}> */
    public static function validate(object $dto): array
    {
        $errors = [];
        foreach ((new ReflectionClass($dto))->getProperties() as $prop) {
            $value = $prop->getValue($dto);
            foreach ($prop->getAttributes() as $attribute) {
                $result = self::check($attribute->newInstance(), $value);
                if ($result !== null) {
                    $errors[] = ['field' => $prop->getName(), ...$result];
                    break;
                }
            }
        }
        return $errors;
    }

    /** @return array{reason: string, params?: array}|null */
    private static function check(object $constraint, mixed $value): ?array
    {
        return match (true) {
            $constraint instanceof Required => self::checkRequired($value),
            $constraint instanceof TypeString => self::checkTypeString($value),
            $constraint instanceof MaxLength => self::checkMaxLength($value, $constraint->limit),
            $constraint instanceof EmailFormat => self::checkEmail($value),
            $constraint instanceof OneOf => self::checkOneOf($value, $constraint->choices),
            $constraint instanceof PositiveInt => self::checkPositiveInt($value),
            default => null,
        };
    }

    private static function checkRequired(mixed $value): ?array
    {
        if ($value === null || $value === '') {
            return ['reason' => 'required'];
        }
        if (!is_string($value)) {
            return ['reason' => 'invalid_type'];
        }
        if (trim($value) === '') {
            return ['reason' => 'required'];
        }
        return null;
    }

    private static function checkTypeString(mixed $value): ?array
    {
        if ($value === null) {
            return null;
        }
        return is_string($value) ? null : ['reason' => 'invalid_type'];
    }

    private static function checkMaxLength(mixed $value, int $limit): ?array
    {
        if (!is_string($value)) {
            return null;
        }
        return mb_strlen($value) > $limit ? ['reason' => 'too_long', 'params' => ['max' => $limit]] : null;
    }

    private static function checkEmail(mixed $value): ?array
    {
        if (!is_string($value) || $value === '') {
            return null;
        }
        return filter_var($value, FILTER_VALIDATE_EMAIL) === false ? ['reason' => 'invalid_format'] : null;
    }

    private static function checkOneOf(mixed $value, array $choices): ?array
    {
        return in_array($value, $choices, true)
            ? null
            : ['reason' => 'invalid_value', 'params' => ['allowed' => $choices]];
    }

    private static function checkPositiveInt(mixed $value): ?array
    {
        if ($value === null || $value === '') {
            return ['reason' => 'required'];
        }
        if (!is_int($value) && !(is_string($value) && is_numeric($value))) {
            return ['reason' => 'invalid_type'];
        }
        return (int) $value > 0 ? null : ['reason' => 'invalid_value'];
    }
}
