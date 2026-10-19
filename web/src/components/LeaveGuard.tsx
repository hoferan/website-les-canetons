import {
  type ReactNode,
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { type BlockerFunction, useBlocker } from "react-router-dom";

type Register = (message: string) => () => void;

const LeaveGuardContext = createContext<Register | null>(null);

/**
 * The app's one navigation blocker, which every `useLeaveGuard` reports to.
 *
 * One blocker for every guard, because React Router consults only the blocker
 * that registered last. A page can hold several guards (the home page has a
 * photo slot per picture, each with its own upload queue), so the guards
 * register here and this blocker asks whether any of them is active.
 *
 * It sees every navigation the router makes: a link, Back and Forward, and a
 * call to `navigate()`. Closing or reloading the tab never reaches the router;
 * `useLeaveGuard` covers that with `beforeunload`. A navigation that stays on
 * the same pathname and query is let through, because it does not leave the
 * page.
 *
 * Mounted only while a guard is active: while any blocker exists, React Router
 * warns on every `popstate` it did not create, such as a register chip's
 * fragment link on /band.
 *
 * Needs a data router (`createBrowserRouter`), which is why App.tsx has one.
 */
export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  // The blocker reads this at the moment somebody navigates, so a guard
  // changing its message has nothing to re-render. Only whether any guard is
  // active at all is state, because that decides whether the blocker exists.
  const messages = useRef(new Map<symbol, string>());
  const [guarding, setGuarding] = useState(false);

  const register = useCallback<Register>((message) => {
    const key = Symbol("leave-guard");
    messages.current.set(key, message);
    setGuarding(true);
    return () => {
      messages.current.delete(key);
      setGuarding(messages.current.size > 0);
    };
  }, []);

  return (
    <LeaveGuardContext.Provider value={register}>
      {guarding && <Blocker messages={messages} />}
      {children}
    </LeaveGuardContext.Provider>
  );
}

function Blocker({ messages }: { messages: RefObject<Map<symbol, string>> }) {
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      messages.current.size > 0 &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
    [messages],
  );
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    // The guard may have cleared between the navigation and this effect, say
    // because the last upload finished; then there is nothing left to ask.
    const message = messages.current.values().next().value;
    if (message === undefined || window.confirm(message)) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, messages]);

  return null;
}

/**
 * Asks before the page is left while `active`.
 *
 * Inside the app, any navigation (a link, Back, `navigate()`) gets `message`
 * in a confirm through `LeaveGuardProvider`, and stays put if the answer is
 * no. Closing or reloading the tab gets the browser's own `beforeunload`
 * prompt, which shows the browser's text, not `message`.
 */
export function useLeaveGuard(active: boolean, message: string): void {
  const register = useContext(LeaveGuardContext);
  if (register === null) {
    // A guard without its provider would look as if it worked and let every
    // navigation through, so it fails loudly instead.
    throw new Error("useLeaveGuard needs a LeaveGuardProvider above it.");
  }

  useEffect(() => {
    if (!active) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const unregister = register(message);
    window.addEventListener("beforeunload", warn);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", warn);
    };
  }, [active, message, register]);
}
