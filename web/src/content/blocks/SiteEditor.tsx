import { useId } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { t } from "../../i18n";
import { BlockEditor, ListField, PlainField, TranslatedField } from "../editor";
import { NETWORKS, type Network } from "../types";

/** The networks' own names, the same in every language. */
const NETWORK_NAMES: Record<Network, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  flickr: "Flickr",
};

const SELECT = "focus-ring min-h-touch rounded-md border border-line bg-panel px-3 text-ink";

/**
 * The site's info in one dialog: the band's name, the line under it, the
 * legal name and the networks the footer links to. A network's address must
 * be https; one the band has no page on is removed from the list.
 */
export function SiteEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BlockEditor blockKey="site" open={open} onClose={onClose}>
      {() => (
        <>
          <PlainField name="name" label={t("blockEditor.site.name")} required />
          <TranslatedField name="pitch" label={t("blockEditor.site.pitch")} multiline required />
          <PlainField name="legalName" label={t("blockEditor.site.legalName")} required />
          <fieldset className="space-y-2">
            <legend className="font-bold">{t("blockEditor.site.networks")}</legend>
            <ListField
              name="networks"
              addLabel={t("blockEditor.site.addNetwork")}
              newItem={() => ({ network: "instagram" as Network, url: "" })}
              itemTitle={(index) => <NetworkName path={`networks.${index}`} />}
              renderItem={(index) => <NetworkFields path={`networks.${index}`} />}
            />
          </fieldset>
        </>
      )}
    </BlockEditor>
  );
}

function NetworkName({ path }: { path: string }) {
  const network = useWatch({ name: `${path}.network` }) as Network;
  return NETWORK_NAMES[network];
}

function NetworkFields({ path }: { path: string }) {
  const { control } = useFormContext();
  const id = useId();

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={id}>{t("blockEditor.site.network")}</label>
        <Controller
          control={control}
          name={`${path}.network`}
          render={({ field }) => (
            <select
              id={id}
              ref={field.ref}
              className={SELECT}
              value={field.value as string}
              onChange={(event) => field.onChange(event.target.value)}
            >
              {NETWORKS.map((network) => (
                <option key={network} value={network}>
                  {NETWORK_NAMES[network]}
                </option>
              ))}
            </select>
          )}
        />
      </div>
      <PlainField
        name={`${path}.url`}
        label={t("blockEditor.site.networkUrl")}
        type="url"
        inputMode="url"
        required
        invalidMessage={t("blockEditor.httpsExpected")}
      />
    </>
  );
}
