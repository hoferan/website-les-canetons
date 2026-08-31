export function Cd() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl">2022 - Les Canetons ont 20 ans&nbsp;!!!</h1>
      <p className="mt-2 text-xl text-ink-muted">Notre nouveau CD vient de sortir&nbsp;!!</p>

      <img src="/assets/img/CD_img.png" alt="La pochette du CD des Canetons" className="mt-6" />

      <p className="mt-6">N’hésitez pas à le commander au plus vite&nbsp;!!</p>

      <div className="mt-6 rounded-lg border border-line bg-panel p-5">
        <h2 className="font-display text-xl">Comment commander</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Auprès des musiciens que vous connaissez</li>
          <li>Auprès de chaque membre du comité</li>
          <li>
            En écrivant à{" "}
            <a href="mailto:comite@lescanetons.org" className="text-violet hover:underline">
              comite@lescanetons.org
            </a>
          </li>
        </ul>
        <p className="mt-4 text-lg font-semibold">
          Prix&nbsp;: <span className="text-violet">20.-</span> pièce
        </p>
        <p className="text-ink-muted">Disponible en CD ou en clé USB</p>
      </div>
    </section>
  );
}
