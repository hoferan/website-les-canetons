import { useId } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { NetworkMark } from "@/components/social";
import { RadioGroup, ToggleOption } from "@/components/ui/radio-group";

import { t } from "../../i18n";
import { BlockEditor, ListField, PlainField, TranslatedField } from "../editor";
import { NETWORK_ICONS, type NetworkIcon } from "../types";

/**
 * The brands' own names, the same in every language. The generic link is the
 * one that gets a word of ours.
 */
function iconName(icon: NetworkIcon): string {
  return (
    (
      {
        instagram: "Instagram",
        facebook: "Facebook",
        flickr: "Flickr",
        youtube: "YouTube",
        tiktok: "TikTok",
        whatsapp: "WhatsApp",
        spotify: "Spotify",
        soundcloud: "SoundCloud",
        linkedin: "LinkedIn",
        x: "X",
        link: null,
      } satisfies Record<NetworkIcon, string | null>
    )[icon] ?? t("blockEditor.site.networkLink")
  );
}

/**
 * The site's info in one dialog: the band's name, the line under it, the
 * legal name and the networks the footer links to. A network is any page: a
 * name, an https address and an icon. One the band has no page on is removed
 * from the list.
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
              newItem={() => ({ label: "", url: "", icon: "link" as NetworkIcon })}
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
  const label = useWatch({ name: `${path}.label` }) as string;
  return label.trim() === "" ? t("blockEditor.site.network") : label;
}

function NetworkFields({ path }: { path: string }) {
  const { control } = useFormContext();
  const labelId = useId();

  return (
    <>
      <PlainField
        name={`${path}.label`}
        label={t("blockEditor.site.networkName")}
        required
        invalidMessage={t("blockEditor.site.networkNameExpected")}
      />
      <PlainField
        name={`${path}.url`}
        label={t("blockEditor.site.networkUrl")}
        type="url"
        inputMode="url"
        required
        invalidMessage={t("blockEditor.httpsExpected")}
      />
      <div className="flex flex-col gap-1">
        <span id={labelId}>{t("blockEditor.site.networkIcon")}</span>
        <Controller
          control={control}
          name={`${path}.icon`}
          render={({ field }) => (
            <RadioGroup
              aria-labelledby={labelId}
              value={field.value as string}
              onValueChange={field.onChange}
              className="flex flex-wrap gap-2 border-0 bg-transparent p-0"
            >
              {NETWORK_ICONS.map((icon) => (
                <ToggleOption
                  key={icon}
                  value={icon}
                  aria-label={iconName(icon)}
                  className="size-11 rounded-xl border-2 border-ink bg-white px-0 text-ink data-[state=checked]:bg-yellow data-[state=checked]:text-ink data-[state=checked]:shadow-raised-sm"
                >
                  <NetworkMark icon={icon} className="size-5" />
                </ToggleOption>
              ))}
            </RadioGroup>
          )}
        />
      </div>
    </>
  );
}
