import type { TranslationKey } from "../i18n";

/** The contact fields, in the order a Swiss committee needs them. */
export const FIELDS: {
  name: "lastName" | "firstName" | "email" | "phone" | "address" | "tableName";
  labelKey: TranslationKey;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  hintKey?: TranslationKey;
}[] = [
  {
    name: "lastName",
    labelKey: "booking.fields.lastName",
    autoComplete: "family-name",
    required: true,
  },
  {
    name: "firstName",
    labelKey: "booking.fields.firstName",
    autoComplete: "given-name",
    required: true,
  },
  {
    name: "email",
    labelKey: "booking.fields.email",
    type: "email",
    autoComplete: "email",
    required: true,
  },
  {
    name: "phone",
    labelKey: "booking.fields.phone",
    type: "tel",
    autoComplete: "tel",
    required: true,
  },
  { name: "address", labelKey: "booking.fields.address", autoComplete: "street-address" },
  { name: "tableName", labelKey: "booking.fields.tableName", hintKey: "booking.tableHint" },
];

export type Contact = Record<(typeof FIELDS)[number]["name"], string>;

export const EMPTY: Contact = {
  lastName: "",
  firstName: "",
  email: "",
  phone: "",
  address: "",
  tableName: "",
};
