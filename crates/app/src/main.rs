//! LocalOS desktop binary.
//!
//! Wires core + platform + ui.

use localos_traits::AppPaths;

fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let paths = localos_platform::NativePaths::new()?;
    tracing::info!(data_dir = ?paths.data_dir(), "LocalOS starting");
    println!("LocalOS v{}", localos_core::version());
    Ok(())
}
