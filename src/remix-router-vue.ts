import {
  Component,
  computed,
  defineComponent,
  Ref,
  ShallowRef,
  shallowRef,
  VNode,
} from "vue";
import { h, inject, provide, ref } from "vue";
import {
  FormEncType,
  FormMethod,
  Location,
  Router,
  DataRouteMatch,
  DataRouteObject,
  RouterState,
  RouteData,
  Navigation,
  Fetcher,
  resolveTo,
  Path,
  To,
} from "@remix-run/router";
import { createBrowserRouter, invariant } from "@remix-run/router";
import {
  getFormSubmissionInfo,
  shouldProcessLinkClick,
  SubmitOptions,
} from "./dom";

////////////////////////////////////////////////////////////////////////////////
//#region Types/Globals/Utils

export interface RouterContext {
  router: Router;
  stateRef: ShallowRef<RouterState>;
}

export interface RouteContext {
  id: string;
  index: boolean;
}

let RouterContextSymbol = Symbol();
let RouteContextSymbol = Symbol();

function getRouterContext(): RouterContext {
  let ctx = inject<RouterContext>(RouterContextSymbol);
  invariant(ctx != null, "No RouterContext available");
  return ctx;
}

function getRouteContext(): RouteContext {
  let ctx = inject<RouteContext>(RouteContextSymbol);
  invariant(ctx != null, "No RouteContext available");
  return ctx;
}
//#endregion

////////////////////////////////////////////////////////////////////////////////
//#region Hooks

export function useNavigate(): Router["navigate"] {
  let ctx = getRouterContext();
  return ctx.router.navigate;
}

export function useLocation(): Ref<Location> {
  let ctx = getRouterContext();
  return computed(() => ctx.stateRef.value.location);
}

export function useNavigation(): Ref<Navigation> {
  let ctx = getRouterContext();
  return computed(() => ctx.stateRef.value.navigation);
}

export function useLoaderData(): Ref<any> {
  let ctx = getRouterContext();
  let routeId = getRouteContext().id;
  return computed(() => ctx.stateRef.value.loaderData[routeId]);
}

export function useActionData(): Ref<any> {
  let ctx = getRouterContext();
  let routeId = getRouteContext().id;
  return computed(() => ctx.stateRef.value.actionData?.[routeId]);
}

export function useFormAction(action = "."): string {
  let { router } = getRouterContext();
  let route = getRouteContext();
  let location = useLocation();

  let path = resolveTo(
    action,
    router.state.matches.map((match) => match.pathnameBase),
    location.value.pathname
  );

  let search = path.search;
  if (action === "." && route.index) {
    search = search ? search.replace(/^\?/, "?index&") : "?index";
  }

  return path.pathname + search;
}

// function createFetcherForm(fetcherKey: string) {
//   let FetcherForm = React.forwardRef<HTMLFormElement, FormProps>(
//     (props, ref) => {
//       return <FormImpl {...props} ref={ref} fetcherKey={fetcherKey} />;
//     }
//   );
//   return FetcherForm;
// }

// let fetcherId = 0;

// type FetcherWithComponents<TData> = Fetcher<TData> & {
//   Form: ReturnType<typeof createFetcherForm>;
//   submit: ReturnType<typeof useSubmitImpl>;
//   load: (href: string) => void;
// };

// export function useFetcher<TData = any>(): FetcherWithComponents<TData> {
//   let router = React.useContext(UNSAFE_DataRouterContext);
//   invariant(router, `useFetcher must be used within a DataRouter`);

//   let [fetcherKey] = React.useState(() => String(++fetcherId));
//   let [Form] = React.useState(() => createFetcherForm(fetcherKey));
//   let [load] = React.useState(() => (href: string) => {
//     invariant(router, `No router available for fetcher.load()`);
//     router.fetch(fetcherKey, href);
//   });
//   let submit = useSubmitImpl(fetcherKey);

//   let fetcher = router.getFetcher<TData>(fetcherKey);

//   let fetcherWithComponents = React.useMemo(
//     () => ({
//       Form,
//       submit,
//       load,
//       ...fetcher,
//     }),
//     [fetcher, Form, submit, load]
//   );

//   React.useEffect(() => {
//     // Is this busted when the React team gets real weird and calls effects
//     // twice on mount?  We really just need to garbage collect here when this
//     // fetcher is no longer around.
//     return () => {
//       if (!router) {
//         console.warn("No fetcher available to clean up from useFetcher()");
//         return;
//       }
//       router.deleteFetcher(fetcherKey);
//     };
//   }, [router, fetcherKey]);

//   return fetcherWithComponents;
// }

// /**
//  * Provides all fetchers currently on the page. Useful for layouts and parent
//  * routes that need to provide pending/optimistic UI regarding the fetch.
//  */
// export function useFetchers(): Fetcher[] {
//   let router = React.useContext(UNSAFE_DataRouterContext);
//   invariant(router, `useFetcher must be used within a DataRouter`);
//   return [...router.state.fetchers.values()];
// }
//#endregion

////////////////////////////////////////////////////////////////////////////////
//#region Components

export const DataBrowserRouter = defineComponent({
  name: "DataBrowserRouter",
  props: {
    routes: {
      type: Array,
      required: true,
    },
    fallbackElement: {
      type: Object,
      required: false,
    },
  },
  setup(props) {
    let routes = props.routes as DataRouteObject[];
    let router = createBrowserRouter({ routes }).initialize();
    let stateRef = shallowRef<RouterState>(router.state);
    router.subscribe((state) => (stateRef.value = state));

    provide<RouterContext>(RouterContextSymbol, {
      router,
      stateRef,
    });

    return () => {
      let state = stateRef.value;
      if (!state.initialized) {
        return h(props.fallbackElement as Component) || h("span");
      }

      return renderRouteWrapper(state.matches[0], state.location?.key);
    };
  },
});

function renderRouteWrapper(match: DataRouteMatch, locationKey: string): VNode {
  return h(
    RouteWrapper,
    {
      id: match.route.id,
      index: match.route.index === true,
      key: `${match.route.id}:${locationKey}`,
    },
    () => h(match.route.element as ReturnType<typeof defineComponent>)
  );
}

export const RouteWrapper = defineComponent({
  name: "RouteWrapper",
  props: {
    id: {
      type: String,
      required: true,
    },
    index: {
      type: Boolean,
      required: true,
    },
  },
  setup(props, { slots }) {
    provide<RouteContext>(RouteContextSymbol, {
      id: props.id,
      index: props.index === true,
    });
    return () => slots.default?.();
  },
});

export const Outlet = defineComponent({
  name: "Outlet",
  setup() {
    let { stateRef, router } = getRouterContext();
    let { id } = getRouteContext();
    return () => {
      let { matches } = router.state;
      let idx = matches.findIndex((m) => m.route.id === id);
      if (idx < 0) {
        console.error("No current match found for outlet");
        return null;
      }
      let match = matches[idx + 1];
      return match
        ? renderRouteWrapper(match, stateRef.value.location.key)
        : null;
    };
  },
});

export const Link = defineComponent({
  name: "Link",
  props: {
    to: {
      type: String,
      required: true,
    },
  },
  setup(props, { slots, attrs }) {
    const { router } = getRouterContext();
    return () =>
      h(
        "a",
        {
          href: props.to,
          onClick(event: MouseEvent) {
            let target =
              typeof attrs.target === "string" ? attrs.target : undefined;
            if (!shouldProcessLinkClick(event, target)) {
              return;
            }
            event.preventDefault();
            router.navigate(props.to);
          },
        },
        slots.default?.()
      );
  },
});

// TODO: Get from react router dom
export interface SubmitFunction {
  (
    /**
     * Specifies the `<form>` to be submitted to the server, a specific
     * `<button>` or `<input type="submit">` to use to submit the form, or some
     * arbitrary data to submit.
     *
     * Note: When using a `<button>` its `name` and `value` will also be
     * included in the form data that is submitted.
     */
    target:
      | HTMLFormElement
      | HTMLButtonElement
      | HTMLInputElement
      | FormData
      | URLSearchParams
      | { [name: string]: string }
      | null,

    /**
     * Options that override the `<form>`'s own attributes. Required when
     * submitting arbitrary data without a backing `<form>`.
     */
    options?: SubmitOptions
  ): void;
}

function useSubmitImpl(router: Router, fetcherKey?: string): SubmitFunction {
  let defaultAction = useFormAction();
  return (target, options = {}) => {
    invariant(
      router != null,
      "useSubmit() must be used within a <DataBrowserRouter>"
    );

    let { method, encType, formData, url } = getFormSubmissionInfo(
      target,
      defaultAction,
      options
    );

    let href = url.pathname + url.search;
    let opts = {
      replace: options.replace,
      formData,
      formMethod: method as FormMethod,
      formEncType: encType as FormEncType,
    };
    if (fetcherKey) {
      router.fetch(fetcherKey, href, opts);
    } else {
      router.navigate(href, opts);
    }
  };
}

export const Form = defineComponent({
  name: "Form",
  setup(props, { attrs, slots }) {
    const { router } = getRouterContext();
    const submit = useSubmitImpl(router);
    const el = ref();
    const btnEl = ref();

    return () =>
      h(
        "form",
        {
          ref: el,
          ...attrs,
          onClick(e: MouseEvent) {
            let submitButton = (
              e?.target as HTMLButtonElement | HTMLInputElement
            )?.closest<HTMLButtonElement | HTMLInputElement>(
              "button,input[type=submit]"
            );
            if (
              submitButton &&
              submitButton?.form === el.value &&
              submitButton?.type === "submit"
            ) {
              btnEl.value = submitButton;
            }
          },
          onSubmit(e: SubmitEvent) {
            e.preventDefault();
            submit(btnEl.value || el.value);
            btnEl.value = null;
          },
        },
        slots.default?.()
      );
  },
});
