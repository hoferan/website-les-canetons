import {
  createContext,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Link as RouterLink,
  Navigate as RouterNavigate,
  Route,
  Routes,
  resolvePath,
  useLocation,
  useNavigate as useRouterNavigate,
  useResolvedPath,
  type Location,
  type NavigateOptions,
  type NavigateProps,
  type Path,
  type To,
} from "react-router-dom";

import { applyDocumentMeta } from "./documentMeta";
import { currentLocale, followLocale } from "./index";
import {
  DEFAULT_LOCALE,
  htmlLang,
  isFrenchAlias,
  localizePath,
  splitLocale,
  type Locale,
} from "./locale";

/**
 * The app's links and navigations, which keep the page's language (#369).
 *
 * The router is mounted once for both languages, and the route table matches
 * paths with the German segment taken off (`LocaleFromUrl`). So an app
 * path such as "/agenda" names a page, not a URL: these put it under `/de` on
 * a German page. The router's own `Link`, `Navigate` and `useNavigate` would
 * send a German visitor to the French page; ESLint keeps them out of the rest
 * of the app.
 *
 * A relative path is resolved first, against the route table's paths, then
 * given the prefix.
 */
function inLocale(path: Path, locale: Locale): Path {
  return { ...path, pathname: localizePath(path.pathname, locale) };
}

/**
 * The router's `Link` in the page's language, or in `locale`, which the
 * language switch uses to point at the same page in the other one.
 */
export function Link({
  to,
  relative,
  locale,
  ...props
}: ComponentProps<typeof RouterLink> & { locale?: Locale }) {
  const path = useResolvedPath(to, { relative });
  return <RouterLink {...props} to={inLocale(path, locale ?? currentLocale())} />;
}

/**
 * This page, search and hash included, as a `Link` to it in another language
 * takes it. `splitLocale` too, for a caller outside `LocaleFromUrl`, whose
 * location still holds the language.
 */
export function useThisPage(): Path {
  const { pathname, search, hash } = useLocation();
  return { pathname: splitLocale(pathname).path, search, hash };
}

/** The router's `Navigate`, in the page's language. */
export function Navigate({ to, relative, ...props }: NavigateProps) {
  const path = useResolvedPath(to, { relative });
  return <RouterNavigate {...props} to={inLocale(path, currentLocale())} />;
}

/** The router's `navigate()`, in the page's language. A number goes back or forward in history. */
export function useNavigate(): (
  to: To | number,
  options?: NavigateOptions,
) => void | Promise<void> {
  const navigate = useRouterNavigate();
  const { pathname } = useLocation();

  return useCallback(
    (to: To | number, options?: NavigateOptions) =>
      typeof to === "number"
        ? navigate(to)
        : navigate(inLocale(resolvePath(to, pathname), currentLocale()), options),
    [navigate, pathname],
  );
}

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * The language from the URL, for everything under it, and the location
 * without the language segment, so `/join` and `/de/join` render the same
 * components and a change of language keeps them mounted, with what was
 * typed in them.
 *
 * The language follows the URL here, on every navigation. It changes while
 * this renders, so everything under it renders in the new language in the
 * same pass; `followLocale` explains why that is synchronous. The document's
 * language and metadata follow before the browser paints.
 *
 * Descendants of a `<Routes location>` read that location from `useLocation()`,
 * so the route table, `ScrollToTop`, the guards and every page see the path
 * without `/de`, and a change of language is no change of page to them.
 *
 * `children` is an element made once, so React would not render it again
 * when the language changes, and `t()` is a plain function: something below
 * has to call `useLocale()` to be rendered again, and everything it renders
 * with it. The route table does.
 */
export function LocaleFromUrl({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { locale, path } = splitLocale(location.pathname);
  followLocale(locale);

  useLayoutEffect(() => {
    document.documentElement.lang = htmlLang(locale);
    applyDocumentMeta(locale);
  }, [locale]);

  const bare: Location = useMemo(() => ({ ...location, pathname: path }), [location, path]);

  // `/fr/join` is `/join`: replaced, so the address bar shows the page's one
  // URL and Back does not come back to the alias.
  if (isFrenchAlias(location.pathname)) {
    const { pathname, search, hash, state } = bare;
    return <RouterNavigate to={{ pathname, search, hash }} state={state} replace />;
  }

  return (
    <LocaleContext value={locale}>
      <Routes location={bare}>
        <Route path="*" element={children} />
      </Routes>
    </LocaleContext>
  );
}

/** The page's language, which renders the caller again when it changes. */
export function useLocale(): Locale {
  return use(LocaleContext);
}
