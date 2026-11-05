import { useWatch } from "react-hook-form";

import { t } from "../../i18n";
import type { Row } from "../types";
import { ListField } from "./ListField";
import { PlainField } from "./PlainField";
import { TranslatedField } from "./TranslatedField";

type RowType = Row["type"];

/** The order "Ajouter une ligne" offers them in. */
const ROW_TYPES = [
  "text",
  "labelValue",
  "phone",
  "email",
  "address",
  "link",
] as const satisfies readonly RowType[];

/** A blank row of each type, as "Ajouter une ligne" adds it. */
const NEW_ROW: { [K in RowType]: () => Extract<Row, { type: K }> } = {
  text: () => ({ type: "text", text: { fr: "" } }),
  labelValue: () => ({ type: "labelValue", label: { fr: "" }, value: { fr: "" } }),
  phone: () => ({ type: "phone", label: { fr: "" }, number: "" }),
  email: () => ({ type: "email", label: { fr: "" }, address: "" }),
  address: () => ({ type: "address", address: "" }),
  link: () => ({ type: "link", label: { fr: "" }, url: "" }),
};

/**
 * A card's rows, each with the fields of its type, and "Ajouter une ligne"
 * offering the six types. A row keeps its type: changing one is removing it
 * and adding another.
 */
export function RowFields({ name }: { name: string }) {
  return (
    <ListField<Row>
      name={name}
      addLabel={t("blockEditor.addRow")}
      choices={ROW_TYPES.map((type) => ({
        label: t(`blockEditor.rowType.${type}`),
        newItem: NEW_ROW[type],
      }))}
      itemTitle={(index) => <RowTitle path={`${name}.${index}`} />}
      renderItem={(index) => <RowBody path={`${name}.${index}`} />}
    />
  );
}

function RowTitle({ path }: { path: string }) {
  const type = useWatch({ name: `${path}.type` }) as RowType;
  return t(`blockEditor.rowType.${type}`);
}

function RowBody({ path }: { path: string }) {
  const type = useWatch({ name: `${path}.type` }) as RowType;
  const label = (key: "text" | "label" | "value") => t(`blockEditor.field.${key}`);

  switch (type) {
    case "text":
      return <TranslatedField name={`${path}.text`} label={label("text")} multiline />;
    case "labelValue":
      return (
        <>
          <TranslatedField name={`${path}.label`} label={label("label")} />
          <TranslatedField name={`${path}.value`} label={label("value")} multiline />
        </>
      );
    case "phone":
      return (
        <>
          <TranslatedField name={`${path}.label`} label={label("label")} />
          <PlainField
            name={`${path}.number`}
            label={t("blockEditor.field.number")}
            type="tel"
            invalidMessage={t("blockEditor.phoneInvalid")}
          />
        </>
      );
    case "email":
      return (
        <>
          <TranslatedField name={`${path}.label`} label={label("label")} />
          <PlainField
            name={`${path}.address`}
            label={t("blockEditor.field.email")}
            type="email"
            inputMode="email"
          />
        </>
      );
    case "address":
      return (
        <>
          <TranslatedField name={`${path}.label`} label={t("blockEditor.field.place")} />
          <PlainField name={`${path}.address`} label={t("blockEditor.field.address")} />
        </>
      );
    case "link":
      return (
        <>
          <TranslatedField name={`${path}.label`} label={label("label")} />
          <PlainField
            name={`${path}.url`}
            label={t("blockEditor.field.url")}
            type="url"
            inputMode="url"
            invalidMessage={t("blockEditor.httpsExpected")}
          />
        </>
      );
  }
}
