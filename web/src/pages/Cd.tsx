import { PageSection } from "@/components/PageSection";
import { Card } from "@/components/ui/card";

export function Cd() {
  return (
    <PageSection width="text">
      <h1 className="font-display text-4xl">2022 - Les Canetons ont 20 ans&nbsp;!!!</h1>
      <p className="mt-tight text-xl text-ink-muted">Notre nouveau CD vient de sortir&nbsp;!!</p>

      <img src="/assets/img/CD_img.png" alt="La pochette du CD des Canetons" className="mt-block" />

      <p className="mt-block">N’hésitez pas à le commander au plus vite&nbsp;!!</p>

      <Card className="mt-block gap-0 p-5">
        <h2 className="font-display text-xl">Comment commander</h2>
        <ul className="mt-related list-disc space-y-tight pl-5">
          <li>Auprès des musiciens que vous connaissez</li>
          <li>Auprès de chaque membre du comité</li>
          <li>
            En écrivant à{" "}
            <a href="mailto:comite@lescanetons.org" className="text-violet hover:underline">
              comite@lescanetons.org
            </a>
          </li>
        </ul>
        <p className="mt-related text-lg font-semibold">
          Prix&nbsp;: <span className="text-violet">20.-</span> pièce
        </p>
        <p className="text-ink-muted">Disponible en CD ou en clé USB</p>
      </Card>
    </PageSection>
  );
}
