import type { Meta, StoryObj } from "@storybook/react-vite";

import { Input } from "../../primitives";
import { FormField } from "./form-field";

/**
 * FormField hands the control the attributes that have to agree (`id`, `required`, `aria-invalid`,
 * `aria-describedby`); the control only spreads them. Label, hint and error are plain, already
 * translated text: the component imports no i18n.
 */
const meta = {
  title: "Composites/FormField",
  component: FormField,
  args: {
    id: "name",
    label: "Nom",
    children: (control) => <Input {...control} />,
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Required: Story = { args: { required: true } };

export const WithHint: Story = { args: { hint: "Comme sur votre carte de membre." } };

export const WithError: Story = { args: { error: "Nom est obligatoire", required: true } };

/** The hint is read first, then the error: the rule, then what broke it. */
export const HintAndError: Story = {
  args: {
    id: "email",
    label: "Courriel",
    required: true,
    hint: "Nous ne l’utilisons que pour répondre.",
    error: "Courriel n’est pas valide",
    children: (control) => <Input {...control} type="email" defaultValue="marie@" />,
  },
};

/** A badge sits inside the label, so it is part of the control's accessible name. */
export const WithBadge: Story = {
  args: { label: "Titre", badge: <span className="text-sm text-content-muted">(FR)</span> },
};

/** `invalid` marks a field that belongs to a group error, with no message of its own. */
export const InvalidInAGroup: Story = { args: { invalid: true } };
