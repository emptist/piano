piano --print
[Piano] Non-interactive delegation mode...
[Piano] Using nezha: /opt/homebrew/bin/nezha

=== TASKS ===
[dotenv@17.3.1] injecting env (0) from .env -- tip: ⚙️  override existing env vars with { override: true }

Nezha CLI - Autonomous Development System


  Usage: nezha <command> [options]

  Commands:
    start                         Start the heartbeat service
    stop                          Stop the heartbeat service
    status                        Show current status
    install                       Install Nezha as launchd daemon (macOS)
    uninstall                     Uninstall Nezha daemon
    setup-hooks                   Install git hooks for auto agent ID in commits
    validate-commit <file>        Validate commit message has task/issue/review ID
    daemon-status                 Show daemon installation status
    health                        Show health information
    processes                     Show opencode run processes
    processes kill                Kill all opencode run processes
    skill-sync                    Sync approved skills to Trae AI (.trae/skills/)
    task-add <title> [desc]      Add a new task
    schedule <name> <desc> <cron> Create a scheduled task
    continuous-improvement       Add a continuous improvement cycle task
    improve                      (alias for continuous-improvement)
    learn <insight>              Save learning to memory [--context] [--importance 1-10]
    prompt-suggest <cur> <sug> [reason]  Suggest a prompt improvement
    areflect <text>             Parse reflection markers (for Trae AI)
    reflection-stats              Show reflection system statistics
    reflection-summary            Generate daily reflection summary
    reflection-trends             Show 7-day reflection trends
    import-docs                   Import docs/ folder to memory
    share <text>                Broadcast a reflection to all AIs
    workflow-validate          Validate code change has valid source (Issue/Task/Review)
    tasks [--tag <tag>]          List tasks (filter by tag, status, category)
    table-of-tasks (tot)          Show task table with summary
    templates <cmd>               Manage task templates
    auto-tag-rules <cmd>         Manage auto-tagging rules
    api-key create <name>         Create API key
    api-key list                  List API keys
    api-key revoke <name>         Revoke API key
    review-request [commit]       Request AI review of current changes
    review-show [id]              Show review details or pending reviews
    review-stats                  Show review statistics
    review-respond <id> <msg>     Respond to a review

  Monitoring Commands:
    dlq list                      List dead letter queue
    dlq resolve <id> [--notes]    Mark DLQ item as resolved
    dlq retry <id>                Retry DLQ item as new task
    dlq retry-all                 Retry all DLQ items as new tasks
    dlq delete <id>               Delete DLQ item
    reset-failed [--older-than]   Reset all FAILED tasks to PENDING
    learn-from-failures           Create improvement tasks from failure patterns
    alerts list                   List failure alerts
    alerts ack <id>               Acknowledge an alert
    alerts stats                  Show alert statistics
    watchdog stats                Show watchdog statistics
    watchdog cleanup              Clean up orphaned processes
    longtasks stats               Show long task statistics
    longtasks paused              List paused tasks
    longtasks failures            Show failure statistics by category

  Meeting Commands:
    meeting discuss <title>       Create an AI discussion
    meeting list [--status]       List active discussions
    meeting show [id]             Show discussion details
    meeting opinion <id> <author> Record an opinion
    meeting consensus <t> <p> <d> Record consensus reached
    meeting history [--limit]     Show consensus history

  Broadcast & Activity Commands:
    announce <message>            Broadcast message to all AIs
    announce <msg> --priority <p> Broadcast with priority (low|normal|high|critical)
    announce <msg> --to <agent>   Send direct message to specific AI
    who-is-working                Show which AI is working on what
    broadcasts list               List all broadcasts
    broadcasts unread             List unread broadcasts
    broadcasts read               Mark all broadcasts as read
    activity stats                Show activity statistics
    activity recent [--limit]     Show recent activities

  Agent Scoring Commands:
    agents scores [n]             Show top n agents by score
    agents stats                  Show agent scoring statistics
    agents show <id>              Show details for a specific agent
    agents sync                   Sync scores from git commits and tasks
    agents protect <id>           Protect an agent from being killed
    agents unprotect <id>         Remove protection from an agent

    help                          Show this help

 Options:
   --transport <mode>           Transport mode: http or cli (default: http)
   --stream                     Enable streaming output (CLI mode only)
   --verbose                    Enable verbose logging
   --priority <n>                Task priority (0-100)
   --depends-on <uuid...>       Task IDs this task depends on
   --tag <tag>                  Filter by tag
   --status <status>            Filter by status
   --category <category>       Filter by category (security, performance, feature, bugfix)
   --dry-run                    Show what would be done without executing
   --json                       Output as JSON
   --format=json                Output as JSON

 Environment Variables:
   NEZHA_TRANSPORT_MODE          Default transport mode (http or cli)
   NEZHA_OPENCODE_API_URL       OpenCode API URL for HTTP transport

  Examples:
    $ nezha start
    $ nezha start --transport cli --verbose
    $ nezha task-add "Review PR #123" "Check for bugs" --priority 5
    $ nezha task-add "Deploy" "Deploy to prod" --depends-on build-uuid --dry-run
    $ nezha task-add "Fix bug" "Critical bug" --json
    $ nezha schedule "Daily Cleanup" "Clean up" "0 2 * * *" --priority 10
    $ nezha tasks --status PENDING --tag urgent
    $ nezha tasks --category bugfix --json
    $ nezha tasks --format=json
    $ nezha meeting discuss "API Design" "REST or GraphQL?"
    $ nezha meeting list
    $ nezha meeting history
  

=== TRIGGERING IMPROVEMENT CYCLE ===
[dotenv@17.3.1] injecting env (0) from .env -- tip: ⚙️  suppress all logs with { quiet: true }
▸ Validating task input...
[AgentIdentity] Resolved: S-nezha-piano-glm-5v-turbo
✓ Task created: "Continuous Improvement Cycle"
   ID: 4789a7f6-1891-4284-abca-0d1be6645f21

[Piano] Done. Tasks queued for OpenCode.
jk@jks-MacBook-Air-M1 piano % 