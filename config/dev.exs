import Config

# Set console logging level to :debug
config :logger, :console, level: :debug

# Set block_scout_web logging level to :debug
config :logger, :block_scout_web, level: :debug

config :logger_json, :backend, level: :none

config :logger, :ecto,
  level: :debug,
  path: Path.absname("logs/dev/ecto.log")

config :logger, :error, path: Path.absname("logs/dev/error.log")

config :logger, :account,
  level: :debug,
  path: Path.absname("logs/dev/account.log"),
  metadata_filter: [fetcher: :account]
