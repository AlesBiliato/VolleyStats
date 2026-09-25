const EMPTY_CONFIG = Object.freeze({
  SUPABASE_URL: "",
  SUPABASE_PUBLISHABLE_KEY: "",
});

function normalizeConfig(source = {}) {
  const url = String(source.SUPABASE_URL || "").trim();
  const publishableKey = String(
    source.SUPABASE_PUBLISHABLE_KEY || "",
  ).trim();
  let validUrl = false;
  try {
    validUrl = ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    validUrl = false;
  }
  return validUrl && publishableKey.startsWith("sb_publishable_")
    ? { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publishableKey }
    : { ...EMPTY_CONFIG };
}

export function isCloudConfigured(config) {
  return Boolean(normalizeConfig(config).SUPABASE_URL);
}

const unavailableResult = () => ({
  data: null,
  error: new Error("Cloud no configurado"),
});

export function createCloudAuth({
  config = globalThis.VOLLEYSTATS_CLOUD_CONFIG,
  createClient =
    globalThis.VOLLEYSTATS_CLOUD_CLIENT_FACTORY ||
    globalThis.supabase?.createClient,
} = {}) {
  const normalized = normalizeConfig(config);
  const hasConfig = Boolean(normalized.SUPABASE_URL);
  let client = null;
  let initializationError = null;

  if (hasConfig && typeof createClient === "function") {
    try {
      client = createClient(
        normalized.SUPABASE_URL,
        normalized.SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
          },
        },
      );
    } catch (error) {
      initializationError = error;
    }
  }

  const safeAuthCall = async (method, payload) => {
    if (!client) return unavailableResult();
    try {
      return payload === undefined
        ? await client.auth[method]()
        : await client.auth[method](payload);
    } catch (error) {
      return { data: null, error };
    }
  };

  return {
    isConfigured: () => Boolean(client),
    getStatus: () =>
      client
        ? "configured"
        : hasConfig
          ? "sdk-unavailable"
          : "not-configured",
    getInitializationError: () => initializationError,
    getSupabaseClient: () => client,
    async getSession() {
      const result = await safeAuthCall("getSession");
      return {
        session: result.data?.session || null,
        error: result.error || null,
      };
    },
    onAuthStateChange(callback) {
      if (!client) return { unsubscribe() {} };
      try {
        const { data } = client.auth.onAuthStateChange((event, session) =>
          callback(event, session),
        );
        return data?.subscription || { unsubscribe() {} };
      } catch {
        return { unsubscribe() {} };
      }
    },
    signUp(email, password) {
      return safeAuthCall("signUp", { email, password });
    },
    signIn(email, password) {
      return safeAuthCall("signInWithPassword", { email, password });
    },
    signOut() {
      return safeAuthCall("signOut");
    },
  };
}

export function friendlyAuthError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  if (code === "invalid_credentials" || message.includes("invalid login"))
    return "Email o contraseña incorrectos.";
  if (code === "email_not_confirmed" || message.includes("email not confirmed"))
    return "Confirma tu email antes de iniciar sesión.";
  if (code === "user_already_exists" || message.includes("already registered"))
    return "Ya existe una cuenta con ese email.";
  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    error instanceof TypeError
  )
    return "No se pudo conectar con Supabase. Tus datos locales siguen disponibles.";
  return error?.message || "No se pudo completar la operación de cuenta.";
}

export function createAccountController(cloud, onChange = () => {}) {
  const state = {
    status: cloud.getStatus(),
    configured: cloud.isConfigured(),
    loading: cloud.isConfigured(),
    busy: false,
    session: null,
    message: "",
    error: "",
  };
  let subscription = null;
  const notify = () => onChange({ ...state });
  const finish = (changes = {}) => {
    Object.assign(state, { busy: false, ...changes });
    notify();
  };

  return {
    getState: () => ({ ...state }),
    async initialize() {
      if (!state.configured) {
        state.loading = false;
        notify();
        return;
      }
      subscription = cloud.onAuthStateChange((_event, session) => {
        finish({ session: session || null, loading: false, error: "" });
      });
      const { session, error } = await cloud.getSession();
      finish({
        session,
        loading: false,
        error: error ? friendlyAuthError(error) : "",
      });
    },
    async signIn(email, password) {
      Object.assign(state, { busy: true, message: "", error: "" });
      notify();
      const { data, error } = await cloud.signIn(email, password);
      if (error) return finish({ error: friendlyAuthError(error) });
      finish({ session: data?.session || state.session, error: "" });
    },
    async signUp(email, password) {
      Object.assign(state, { busy: true, message: "", error: "" });
      notify();
      const { data, error } = await cloud.signUp(email, password);
      if (error) return finish({ error: friendlyAuthError(error) });
      finish({
        session: data?.session || state.session,
        message: data?.session
          ? "Cuenta creada y sesión iniciada."
          : "Cuenta creada. Revisa tu email para confirmar el acceso.",
      });
    },
    async signOut() {
      Object.assign(state, { busy: true, message: "", error: "" });
      notify();
      const { error } = await cloud.signOut();
      if (error) return finish({ error: friendlyAuthError(error) });
      finish({ session: null, message: "Sesión cerrada." });
    },
    destroy() {
      subscription?.unsubscribe?.();
      subscription = null;
    },
  };
}

export const cloudAuth = createCloudAuth();
