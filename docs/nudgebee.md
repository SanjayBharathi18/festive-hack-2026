---
title: NudgeBee
purpose: Verified facts about NudgeBee and its Kubernetes agent, for the alert rules and the workflow files of the build.
read-when: You install the agent, connect alerts, change a NudgeBee workflow file, or run the incident runbook.
owns: NudgeBee access, agent install, events and alerts, AI analysis, workflows, approvals, API and CLI, limits
---

# NudgeBee

NudgeBee is an AI operations platform for Kubernetes. An agent in the cluster connects to the NudgeBee server through an outbound relay. Most telemetry stays in the cluster (ClickHouse, Prometheus). The server finds problems, explains the root cause, and runs fixes after a person approves them.

This build simulates NudgeBee on `/ops` (README.md, "Prototype parts"). The alert rules (`deploy/prometheus-rules.yaml`) and the workflow files (`nudgebee/`) are ready for a tenant (README.md, "Plug in the services").

## Access

- Self-service sign-up is off. The sign-up page says: "Sign-up is disabled. Contact our admin at contact@nudgebee.com for onboarding. Please include your email address and tenant name."
- The Cloud free tier covers two clusters and two cloud accounts.
- No AI quota is published for the free tier. A default budget caps the AI cost each month: $1,000 for the tenant, and for each account $600 for event analysis and $400 for NuBi chat. At the cap, new analyses are refused until the month resets (UTC).

## Agent install

1. In the app: Admin, Integrations, Kubernetes Clusters, Add K8s Account. Copy the auth key (`<access key>:<secret>`).
2. Get the script: `wget https://raw.githubusercontent.com/nudgebee/k8s-agent/main/installation.sh`.
3. Run `bash installation.sh -a <key>`.
   - Do not pass `-d`. It removes the eBPF node agent, so there are no network metrics, L7 traces or profiling. Use `-d true` only on kind.
   - Do not pass `-n` or `-z`. The bundled Alertmanager receiver expects the release and namespace `nudgebee-agent`.
4. If no Prometheus is found, the script asks to install kube-prometheus-stack (release `nudgebee-prometheus`). Answer "yes". Any other answer stops the install. A later Loki question is optional.
5. Metrics show after about 5 minutes. Rightsizing needs about 1 hour.

- The install command in the UI is minimal (`-g true -x true -t true`): no Prometheus and no traces. Use the script.
- Requirements: Kubernetes 1.27 or later, Helm 3, cluster-admin rights, a namespace that allows privileged pods, and a default StorageClass. The node agent needs Linux kernel 5.8 or later.
- Storage claims: ClickHouse 50 Gi, Prometheus 50 Gi, Loki 10 Gi. The k3s `local-path` StorageClass does not enforce sizes, so watch disk use.
- Network: outbound TCP 443 only, to relay.nudgebee.com, collector.nudgebee.com, ghcr.io, nudgebee.github.io and raw.githubusercontent.com. No inbound ports.
- k3s: supported (FAQ). The docs have no k3s caveats.

The bundled kube-prometheus-stack comes pre-wired:

- An Alertmanager receiver for the agent runner (`http://nudgebee-agent-runner.nudgebee-agent.svc/api/alerts`), on a catch-all route with `continue: true` and `group_wait: 1s`. The `Watchdog` alert reaches NudgeBee and shows that the connection works.
- `ruleSelectorNilUsesHelmValues` and `serviceMonitorSelectorNilUsesHelmValues` are false, so our PrometheusRule and ServiceMonitor need no `release` label.
- Grafana with the login admin/admin. Change it.
- On k3s, the default rules of kube-prometheus-stack usually fire KubeControllerManagerDown, KubeSchedulerDown, KubeProxyDown and etcd alerts. The catch-all route sends them to NudgeBee. Turn those rules off.

## Events and alerts

- Kubernetes events (for example CrashLoopBackOff and OOMKilled) become NudgeBee events.
- Alert sources: Alertmanager, 18 vendor webhooks, and the generic Event Webhook (JSON, up to 100 alerts in each request; one invalid alert rejects the whole request).
- Alerts on app metrics: a PromQL alert in the UI, or a PrometheusRule.
- Priority: for Alertmanager payloads, `severity` critical or high gives High, warning gives Medium, and no severity gives Low. The docs state this for the external webhook. "Override priority" on an alert in the UI also works.

## AI analysis

- NuBi, the AI agent, examines high-priority events automatically. The output is a "5 Whys" chain with evidence and recommendations.
- Settings: Admin, Tenant Settings, Features, "Automatic event analysis", and for each account Integrations, Settings, AI Event Analysis. Lower priorities need a rule from NudgeBee support.
- "Reuse the analysis of a recent similar event" can skip a fresh analysis. Put a namespace under Always-Fresh Namespaces to prevent this.
- Root cause: NuBi looks at CI/CD deploys, commits, and ConfigMap and Secret changes. It falls back to recent configuration changes and alerts from the same node or namespace. The docs do not say that it reads events that a workflow creates.

## Workflows

- Triggers: manual, schedule (cron, UTC), webhook, event, optimization recommendation.
- A trigger needs at least one filter. An advanced filter expression counts. If "Listen to accounts" is empty, the workflow hears only its own account.
- Webhook trigger: make an Automation Webhook (Admin, Integrations, Webhooks) and link it to the workflow. The URL ends in `/api/webhooks/workflow?token=…`. The token is the authentication.
  - The parsed body is `Inputs.webhook_json`. The raw body is `Inputs.webhook_payload`.
  - Inside the filter, the parsed body is called `webhook_payload`. The filter has 500 characters at most and must render exactly `true`.
- Event trigger: by default it starts at `event.created`, before the AI analysis. To wait for the root cause, add `"on": "investigation.completed"` under the trigger `params`. `investigation.failed` also fires. An investigation runs only for a high-priority event.
  - There is no alert-name field. Use an advanced filter, for example `{{ event.labels.alertname == "ReadingInvalidRateHigh" }}`.
  - The fields in `Inputs.event.labels` depend on the event source. Look at the input of one real run first.
- HTTP task (`integrations.http`):
  - Methods GET, POST, PUT, DELETE, PATCH, HEAD and OPTIONS; headers; body. Content type JSON by default; an object body is encoded as JSON.
  - `auth_type`: bearer, basic, api_key or oauth2. With `api_key`, the raw `api_key` value goes into the `api_header_name` header (default `Authorization`), with no prefix.
  - Set `timeout`. The docs give 30 s as the default, but the code uses the remaining time of the step when `timeout` is not set.
  - Output: `status_code`, `headers` and `body` (parsed JSON, or a raw string).
  - A status of 400 or more makes the step fail, with no output. Redirects are followed.
  - Requests go out from NudgeBee's servers. Private, loopback and link-local addresses are refused.
- Other task types: `core.switch`, `core.foreach`, `core.wait`, `core.call-workflow`, `k8s.workload_restart`, `k8s.cli`, `scripting.run_script`, `observability.metrics` (PromQL), `notifications.im`, `notifications.email`, `events.store`, `events.add_evidence`, and AI tasks (`llm.summary`, `llm.investigate`, `llm.classify`, `llm.mcp_call`).
- `events.store` writes an event. Required: `title`, `description`, `finding_type`, `subject_name`, `status`. The live docs also require `aggregation_key`, `finding_id` and `priority` (default `INFO`); send all three. Optional: labels, `subject_namespace`, markdown evidence. Evidence shows only with `additional_info.actual_action_name: text_enricher`. The same account and `finding_id` update the old event. `trigger_ai_analysis` and `trigger_notification_im` are true by default.
- `events.add_evidence` with `event_id: {{ Inputs.event.id }}` adds a result to the event of the alert.
- A workflow file has `name` and `definition`. The trigger filter is `params.filter`; an approval task sets `approval_type`. The files in `nudgebee/` follow this shape.
- Templates: `{{ Inputs.x }}`, `{{ Tasks['id'].output.x }}`, `Secrets`, `Vars`, `Configs`. NudgeBee's Workflow Tasks Reference lists `Inputs.workflow_execution_id` as an automatic input. `Vars` are values that an earlier task sets, so fixed IDs go in `Configs`. Secrets are masked in logs and task inputs, but not in task outputs.
- Each task has `id`, `type`, `params`, `depends_on`, `if`, `timeout` and `failure_policy` (`retry`, `action: continue | fail`). The Automation Settings pre-fill 3 retries, and these retries also repeat 4xx errors.
- Runs act as the workflow owner: the creator, or the person who last made a version live.
- A version must be published, made live and set Active before it triggers.
- Dry Run sends real HTTP requests.

## Approvals

- `core.approval` modes: `in_app` (default), `instant_message` (`slack` or `ms_teams`) and `email`. Discord cannot carry approvals.
- `in_app` sends no notification. The approver opens the waiting run in the execution view.
- The step completes with `output.status` set to `"approve"` or `"reject"`. A reject does not stop the run. Gate each later step, for example `if: "{{ Tasks['approval'].output.status == 'approve' }}"`, or use `core.switch`.
- Timeout: the Task Timeout of the step, then the Automation Timeout (pre-filled 5 minutes), then 10 minutes. The Automation Timeout caps the whole run. If nobody answers in time, the step fails.
- The GraphQL mutation `workflow_complete_approval` (with `request: WorkflowCompleteApprovalRequest!`) can also complete an approval.

## API and CLI

- GraphQL: `POST /api/graphql` with `Authorization: Bearer sk-nb-…`. Tokens are under the avatar, API Tokens, with a default expiry of 90 days. Errors come back as HTTP 200 with an `errors` array. `workflow_execute` starts a workflow.
- `nbctl workflow validate <file.yaml>` checks a workflow file. `nbctl workflow apply <file.yaml>` creates or updates the workflow, so workflows can live in git. `nbctl mcp` runs an MCP server.
- A workflow file has `triggers` and `tasks`. A definition-level `timeout` is the Automation Timeout (Go durations, for example `45m`).

## Timing

- The docs say that a test alert appears within 1 to 2 minutes. They give no figure for the time from an alert to `investigation.completed`.

## Links

- Docs: https://docs.nudgebee.com/docs/
- Install script: https://docs.nudgebee.com/docs/installation/agent/installation/install-script/
- Local setup: https://docs.nudgebee.com/docs/installation/agent/local-setup/
- Connect Alertmanager: https://docs.nudgebee.com/docs/installation/agent/connect/alertmanager/
- Event analysis: https://docs.nudgebee.com/docs/features/ai/event-analysis/
- AI budgets: https://docs.nudgebee.com/docs/features/ai/budgets-and-limits/
- Workflow triggers: https://docs.nudgebee.com/docs/features/workflow-builder/triggers/
- Core tasks and approvals: https://docs.nudgebee.com/docs/features/workflow-builder/core-tasks/
- HTTP task: https://docs.nudgebee.com/docs/features/workflow-builder/integration-tasks/
- Event tasks: https://docs.nudgebee.com/docs/features/workflow-builder/event-tasks/
- Workflow did not trigger: https://docs.nudgebee.com/docs/features/workflow-builder/workflow-did-not-trigger/
- nbctl: https://github.com/nudgebee/nbctl
- Sign-up: https://app.nudgebee.com/signup
