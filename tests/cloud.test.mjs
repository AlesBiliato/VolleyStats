import test from "node:test";
import assert from "node:assert/strict";
import {
  createAccountController,
  createCloudAuth,
  friendlyAuthError,
  isCloudConfigured,
} from "../src/cloud.js";
import {
  normalizeCloudConfig,
  renderCloudConfig,
} from "../scripts/cloud-config.mjs";

const validConfig = {
  SUPABASE_URL: "https://volleystats.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-only",
};

function mockCloud({ session = null, signInError = null, throwOnSignIn = null } = {}) {
  let currentSession = session;
  let listener = () => {};
  const calls = [];
  const client = {
    auth: {
      async getSession() {
        return { data: { session: currentSession }, error: null };
      },
      onAuthStateChange(callback) {
        listener = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signInWithPassword(credentials) {
        calls.push(["signIn", credentials]);
        if (throwOnSignIn) throw throwOnSignIn;
        if (signInError) return { data: null, error: signInError };
        currentSession = {
          user: { email: credentials.email },
          access_token: "mock-access-token",
        };
        listener("SIGNED_IN", currentSession);
        return { data: { session: currentSession }, error: null };
      },
      async signUp(credentials) {
        calls.push(["signUp", credentials]);
        return { data: { session: null }, error: null };
      },
      async signOut() {
        calls.push(["signOut"]);
        currentSession = null;
        listener("SIGNED_OUT", null);
        return { error: null };
      },
    },
  };
  let options;
  const cloud = createCloudAuth({
    config: validConfig,
    createClient: (url, key, receivedOptions) => {
      options = { url, key, ...receivedOptions };
      return client;
    },
  });
  return { cloud, calls, options };
}

test("cloud desactivado o incompleto no inicializa el cliente", async () => {
  let calls = 0;
  const createClient = () => {
    calls += 1;
  };
  for (const config of [
    {},
    { SUPABASE_URL: validConfig.SUPABASE_URL },
    { SUPABASE_PUBLISHABLE_KEY: validConfig.SUPABASE_PUBLISHABLE_KEY },
    { ...validConfig, SUPABASE_PUBLISHABLE_KEY: "sb_secret_forbidden" },
  ]) {
    const cloud = createCloudAuth({ config, createClient });
    assert.equal(cloud.isConfigured(), false);
    assert.equal(cloud.getStatus(), "not-configured");
    assert.deepEqual(await cloud.getSession(), {
      session: null,
      error: new Error("Cloud no configurado"),
    });
  }
  assert.equal(calls, 0);
});

test("configuración solo acepta URL y publishable key completas", () => {
  assert.equal(isCloudConfigured(validConfig), true);
  assert.deepEqual(normalizeCloudConfig(validConfig), validConfig);
  assert.deepEqual(normalizeCloudConfig({ ...validConfig, SUPABASE_URL: "javascript:alert(1)" }), {
    SUPABASE_URL: "",
    SUPABASE_PUBLISHABLE_KEY: "",
  });
  const script = renderCloudConfig(validConfig);
  assert.match(script, /VOLLEYSTATS_CLOUD_CONFIG/);
  assert.match(script, /sb_publishable_test-only/);
  assert.doesNotMatch(script, /service_role|sb_secret_/);
});

test("cliente Auth solicita persistencia de sesión y recupera sesión existente", async () => {
  const session = { user: { email: "coach@example.com" } };
  const { cloud, options } = mockCloud({ session });
  assert.equal(options.url, validConfig.SUPABASE_URL);
  assert.equal(options.key, validConfig.SUPABASE_PUBLISHABLE_KEY);
  assert.deepEqual(options.auth, {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  });
  const controller = createAccountController(cloud);
  await controller.initialize();
  assert.equal(controller.getState().session.user.email, "coach@example.com");
  assert.equal(controller.getState().loading, false);
});

test("sin sesión muestra estado autenticable y login/logout actualizan sesión", async () => {
  const { cloud, calls } = mockCloud();
  const controller = createAccountController(cloud);
  await controller.initialize();
  assert.equal(controller.getState().configured, true);
  assert.equal(controller.getState().session, null);

  await controller.signIn("coach@example.com", "correcta");
  assert.equal(controller.getState().session.user.email, "coach@example.com");
  assert.deepEqual(calls[0], [
    "signIn",
    { email: "coach@example.com", password: "correcta" },
  ]);

  await controller.signOut();
  assert.equal(controller.getState().session, null);
  assert.deepEqual(calls.at(-1), ["signOut"]);
});

test("registro no conserva la contraseña en el estado de interfaz", async () => {
  const { cloud, calls } = mockCloud();
  const controller = createAccountController(cloud);
  await controller.initialize();
  await controller.signUp("new@example.com", "solo-para-el-mock");
  assert.deepEqual(calls.at(-1), [
    "signUp",
    { email: "new@example.com", password: "solo-para-el-mock" },
  ]);
  assert.doesNotMatch(JSON.stringify(controller.getState()), /solo-para-el-mock/);
  assert.match(controller.getState().message, /Revisa tu email/);
});

test("errores de login y red quedan controlados sin tocar datos locales", async () => {
  const localData = { match: { id: "local-match", score: [3, 2] } };
  const invalid = mockCloud({
    signInError: { code: "invalid_credentials", message: "Invalid login credentials" },
  });
  const invalidController = createAccountController(invalid.cloud);
  await invalidController.initialize();
  await invalidController.signIn("coach@example.com", "incorrecta");
  assert.equal(invalidController.getState().error, "Email o contraseña incorrectos.");

  const offline = mockCloud({ throwOnSignIn: new TypeError("Failed to fetch") });
  const offlineController = createAccountController(offline.cloud);
  await offlineController.initialize();
  await offlineController.signIn("coach@example.com", "cualquiera");
  assert.match(offlineController.getState().error, /datos locales siguen disponibles/);
  assert.deepEqual(localData, { match: { id: "local-match", score: [3, 2] } });
  assert.match(friendlyAuthError(new Error("network unavailable")), /Supabase/);
});
