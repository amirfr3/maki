use std::process::Command;
use std::sync::LazyLock;

use maki_config::providers::{ProvidersConfig, resolve_api_key_env};

use crate::providers::anthropic::bedrock;
use crate::providers::copilot::auth as copilot_auth;
use crate::spec::ProviderRegistry;

/// Read once: a custom provider added to `providers.toml` mid-session is only
/// stripped after a restart.
static PROVIDER_KEY_VARS: LazyLock<Vec<String>> =
    LazyLock::new(|| provider_key_vars(&ProvidersConfig::load_or_default()));

/// Keeps the provider keys maki reads out of a process it launches, where a
/// bash command could print them into the model's context and an MCP server or
/// script is someone else's code. Env set on `cmd` afterwards still goes
/// through, which is how an MCP server's `environment` passes a key on purpose.
pub fn strip_provider_keys(cmd: &mut Command) -> &mut Command {
    for var in PROVIDER_KEY_VARS.iter() {
        cmd.env_remove(var);
    }
    cmd
}

/// Builtin slugs ignore `api_key_env` in `providers.toml`, so an override
/// there names a var maki never reads.
fn provider_key_vars(config: &ProvidersConfig) -> Vec<String> {
    let builtin = ProviderRegistry::builtins()
        .iter()
        .map(|spec| spec.api_key_env)
        .chain(copilot_auth::TOKEN_ENV_VARS.iter().copied())
        .chain([bedrock::BEARER_TOKEN_ENV])
        .filter(|var| !var.is_empty())
        .map(str::to_owned);
    let custom = config
        .providers
        .iter()
        .filter(|(slug, _)| ProviderRegistry::get(slug).is_none())
        .map(|(slug, def)| resolve_api_key_env(slug, Some(def)));
    let mut vars: Vec<String> = builtin.chain(custom).collect();
    vars.sort_unstable();
    vars.dedup();
    vars
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use maki_config::providers::ProviderDef;
    use test_case::test_case;

    use super::*;
    use crate::providers::anthropic;

    const CUSTOM_SLUG: &str = "my-proxy";
    const CUSTOM_KEY_ENV: &str = "MY_PROXY_SECRET";
    const DEFAULT_SLUG: &str = "other-proxy";
    const DEFAULT_KEY_ENV: &str = "OTHER_PROXY_API_KEY";
    const IGNORED_KEY_ENV: &str = "MAKI_TEST_IGNORED_KEY";
    const UNRELATED_TOKEN: &str = "GH_TOKEN";
    const SECRET: &str = "sk-secret";

    fn config() -> ProvidersConfig {
        let with_env = |env: &str| ProviderDef {
            api_key_env: Some(env.into()),
            ..Default::default()
        };
        ProvidersConfig {
            providers: HashMap::from([
                (CUSTOM_SLUG.into(), with_env(CUSTOM_KEY_ENV)),
                (DEFAULT_SLUG.into(), ProviderDef::default()),
                (anthropic::SPEC.slug.into(), with_env(IGNORED_KEY_ENV)),
            ]),
        }
    }

    #[test_case(anthropic::SPEC.api_key_env, true ; "builtin_key")]
    #[test_case(copilot_auth::TOKEN_ENV_VARS[1], true ; "copilot_fallback_token")]
    #[test_case(bedrock::BEARER_TOKEN_ENV, true ; "bedrock_bearer_token")]
    #[test_case(CUSTOM_KEY_ENV, true ; "custom_api_key_env")]
    #[test_case(DEFAULT_KEY_ENV, true ; "custom_default_slug_key")]
    #[test_case(IGNORED_KEY_ENV, false ; "builtin_api_key_env_override_ignored")]
    #[test_case(UNRELATED_TOKEN, false ; "unrelated_token_kept")]
    fn provider_key_vars_membership(var: &str, stripped: bool) {
        assert_eq!(
            provider_key_vars(&config()).iter().any(|v| v == var),
            stripped
        );
    }

    #[cfg(unix)]
    #[test]
    fn child_sees_only_keys_set_after_strip() {
        let inherited = anthropic::SPEC.api_key_env;
        let explicit = bedrock::BEARER_TOKEN_ENV;
        let mut cmd = Command::new("printenv");
        cmd.args([inherited, explicit]).env(inherited, SECRET);
        let output = strip_provider_keys(&mut cmd)
            .env(explicit, SECRET)
            .output()
            .unwrap();
        assert_eq!(output.stdout, format!("{SECRET}\n").as_bytes());
    }
}
