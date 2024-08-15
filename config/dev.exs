import Config

# Set console logging level to :debug
config :logger, :console,
  level: :debug,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Set block_scout_web logging level to :debug
config :logger, :block_scout_web,
  level: :debug,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Ensure that the logger backend is configured
config :logger,
  backends: [:console, {LoggerFileBackend, :error_log}]

# Configure the file backend
config :logger, :error_log,
  path: "/app/logs/error.log",
  level: :debug

config :logger_json, :backend, level: :none

config :logger, :ecto,
  level: :debug,
  path: Path.absname("logs/dev/ecto.log")

config :logger, :error, path: Path.absname("logs/dev/error.log")

config :logger, :account,
  level: :debug,
  path: Path.absname("logs/dev/account.log"),
  metadata_filter: [fetcher: :account]
