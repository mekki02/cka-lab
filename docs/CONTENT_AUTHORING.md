# Content authoring

All course content is plain files under `content/`, reviewed like code. Adding a lesson, lab, quiz, exam or cheat sheet needs **no application code change**: edit files, run the checker, build the images.

```
content/
  curriculum.yaml                       domains, competencies, modules, lessons (order + status)
  lessons/<module-id>/<lesson-id>.mdx   lesson bodies (compiled into the web image)
  labs/<lab-id>.yaml                    hands-on labs
  quizzes/<quiz-id>.yaml                module quizzes (graded server-side)
  exams/<exam-id>.yaml                  timed mock exams
  cheatsheets/NN-<id>.yaml              reference snippets
```

**Always run before committing:**

```bash
npm run content:check     # schemas, references, competency coverage, lesson bodies
npm run build -w @cka/web # compiles every MDX lesson — catches MDX syntax errors
```

## The curriculum

`curriculum.yaml` is the outline. Rules enforced by the checker:

- The five exam domains must exist with their official **weights (sum 100)** and **competencies, quoted verbatim** from the CNCF curriculum. Extra tracks (like `platform-tools`) have weight 0.
- Every official competency must be covered by at least one module (`modules[].competencies`).
- Ids are kebab-case and unique; lesson ids are global.
- `status: published` lessons must have a body; `planned` ones show as "coming soon".
- `prerequisites` default to the previous lesson in the module; list ids explicitly to override.

When the CNCF updates the exam: update `kubernetesVersion`, the domain weights and competency texts, then fix whatever the checker reports.

### Adding a lesson

1. Add it to its module in `curriculum.yaml` (`status: planned` until written).
2. Create `content/lessons/<module-id>/<lesson-id>.mdx` starting with:

   ```mdx
   ---
   id: <lesson-id>
   ---
   ```

3. Write it (structure below), set `status: published`, run both checks.

## Lesson structure — the nine steps

Every substantial topic follows the same sequence. Mark each section with `<Phase step="…" />` right before its heading; the UI numbers them.

| Step | `step=` | Content |
|---|---|---|
| 1 | `theory` | Why the concept exists, how it works internally. No filler. |
| 2 | `visualization` | A `<Diagram>` (Mermaid) or a table that shows the moving parts |
| 3 | `command-line` | Real commands with **real output** (`<Terminal>`), every important flag explained |
| 4 | `example` | A complete, working manifest |
| 5 | `guided` | `<Exercise kind="guided">` — steps the learner follows |
| 6 | `challenge` | `<Exercise kind="challenge">` — goal only; `<Hint>` and `<Solution>` collapsed |
| 7 | `troubleshooting` | `<Exercise kind="troubleshooting">` — a realistic breakage to diagnose |
| 8 | `solution` | Step-by-step diagnosis and fix |
| 9 | `check` | Two or three `<KnowledgeCheck>` questions testing understanding |

Style:

- Open with the problem the topic solves and why it matters for an administrator (and the exam). Never "In this lesson you will learn…".
- Show commands **with their output**, taken from a real cluster of the curriculum's Kubernetes version. Note when output varies (names, IPs, ages).
- Prefer the exam workflow: imperative commands with `--dry-run=client -o yaml`, `kubectl explain`, verification after every change.
- End with a clean-up block.
- State version assumptions explicitly ("deprecated since v1.33", "GA in v1.33").

## Components reference

Available in every `.mdx` without imports.

### `<Terminal>` — a command and its output

```mdx
<Terminal
  command="kubectl get svc web"
  output={`NAME   TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
web    ClusterIP   10.96.142.31   <none>        80/TCP    5s`}
/>
```

- Multi-line commands: use a template literal; lines ending in `\\` (escaped backslash) continue without a new prompt.
- `prompt="debug#"` changes the prompt; `title="…"` the window title.
- **Output whose indentation matters (YAML, JSON) must go in a fenced block as children** — MDX strips leading spaces from multi-line attribute strings:

  ````mdx
  <Terminal command="kubectl get svc web -o yaml">
  ```text
  spec:
    ports:
    - port: 80
  ```
  </Terminal>
  ````

### Code blocks

Fenced code is highlighted at build time. Add a title with `title="…"`:

````mdx
```yaml title="web.yaml"
apiVersion: v1
kind: Service
```
````

Languages: `bash`, `shell`, `console`, `yaml`, `json`, `text`, `ini`, `go`, `python`, `dockerfile`.

### `<Callout type="…" title="…">`

Types: `note`, `tip`, `warning`, `danger`, `exam` (exam tips), `mistakes` (common mistakes). The title is optional.

### `<Diagram chart={`…`} caption="…" />`

Mermaid source (flowchart, sequenceDiagram…). Prefer `flowchart TB` over `LR` for more than five nodes — wide diagrams are scaled down and become hard to read. Keep labels short; quote labels containing punctuation.

### Exercises

```mdx
<Exercise kind="challenge" title="A Service for only some Pods">
Task description in Markdown…

<Hint>One nudge.</Hint>

<Solution>
Full solution with commands and explanation.
</Solution>
</Exercise>
```

`kind`: `guided`, `challenge`, `troubleshooting`.

### `<KnowledgeCheck>`

```mdx
<KnowledgeCheck
  question="What happens when…?"
  options={['A', 'B', 'C', 'D']}
  answer={1}
  explanation="Why B is right and the others are not."
/>
```

`answer` is the zero-based index. These are formative and not stored; graded assessment belongs in the module quiz.

### Links

`<LabLink id="lab-id">Text</LabLink>`, `<QuizLink id="quiz-id">Text</QuizLink>`, and normal Markdown links (`/learn/...` paths stay in the app).

### MDX pitfalls (all hit while writing the first lessons)

| Problem | Fix |
|---|---|
| `{` or `<` in prose is parsed as JSX (`<none>`, `{.items}`) | Put it in inline code: `` `<none>` `` |
| A multi-line JSX element inside a list item fails ("Unexpected lazy line") | Use paragraphs (`**1. Step.**`) instead of a list around it |
| `\"` inside a `command="…"` attribute | JSX string attributes have no escapes: use a template literal `command={`…`}` |
| `${VAR}` inside a template literal attribute | It interpolates: write `\${VAR}` |
| YAML output loses indentation | Pass output as a fenced block child (see `<Terminal>`) |

## Labs (`content/labs/<id>.yaml`)

```yaml
id: services-broken-shop
title: "The shop is down: debugging Services"
module: services                 # must exist in curriculum.yaml
type: troubleshooting            # guided | challenge | troubleshooting
difficulty: intermediate         # beginner | intermediate | advanced
minutes: 40
environment:
  cluster: kind                  # kind | kubeadm | any
  destructive: false             # true = breaks/reconfigures the cluster itself
  requirements: [ ... ]
scenario: |                      # Markdown
objectives: [ ... ]              # Markdown, one line each
setup: { description: ..., commands: | ... }
tasks:
  - id: catalog-endpoints
    title: ...
    description: |               # Markdown
    hints: [ ... ]
    checks:
      - { id: has-endpoints, description: ..., command: "kubectl ...", expect: "true true", match: exact }
    solution: |                  # Markdown, revealed on request
verifyScript: |                  # optional read-only bash, PASS/FAIL per objective
reset: { description: ..., commands: | ... }
```

### Automatic checks (`match`)

In a browser lab environment, checks with `match` run on the student's cluster when they press **Check my work**:

| `match` | Passes when |
|---|---|
| `exact` | trimmed stdout equals `expect` (quote YAML values like `"80->8080"`) |
| `contains` | stdout contains `expect` |
| `regex` | stdout matches the regular expression `expect` — do not anchor with `^`/`$` if the command may print extra lines (`kubectl run -i` prints a `pod deleted` line, agnhost prints no newline) |
| `success` | the command exits 0; `expect` describes what that proves |

Rules: checks must be **read-only** and finish in 30 s; they run with admin rights *on the student's virtual cluster*, never on the platform. Leave `match` out when the command needs a value the student must fill in (`<node-ip>`; the checker rejects such auto checks) or the output needs judgement — the UI then shows "check yourself". `setup.commands` run with `set -e` in the environment before the student arrives, and `verifyScript` is run by **Run verify** (lines starting with `PASS`/`FAIL` are shown).

Labs with `environment.destructive: true` (node, kubelet, etcd, kubeadm work) cannot run in a virtual cluster; keep them for the student's own cluster.

**Validation rule for publishing a lab:** run it for real — setup, see checks fail, apply the solutions, see every check and the verify script pass, run the reset. Do it in a browser lab environment too: start the lab, run **Check my work** before and after solving, then **Run verify**. Record the Kubernetes version you used in the commit message.

YAML gotchas: quote any value containing `: ` or starting with a special character (`'…'`); prefer `|` blocks for Markdown.

## Quizzes (`content/quizzes/<id>.yaml`)

```yaml
id: services-networking-quiz
title: Services and Endpoints
module: services
description: ...
passPercent: 70
questions:
  - id: q1
    type: single                 # single | multiple | scenario (single answer, long stem)
    prompt: Markdown question
    options:
      - { id: a, text: ..., explanation: Why this option is right/wrong }
      - { id: b, text: ..., correct: true, explanation: ... }
    explanation: The general takeaway, shown after submission
```

- `single`/`scenario`: exactly one `correct: true`. `multiple`: at least one. The checker enforces it.
- A multiple-answer question scores only if the selection is exactly right.
- Every option needs an explanation — wrong options teach as much as the right one.
- Test understanding, not recall: ask what *happens*, what *breaks*, what you would *check first*.

## Mock exams (`content/exams/<id>.yaml`)

Tasks have `domain`, `points`, a `context` line (the `kubectl config use-context …` to run), a Markdown `description`, one or more `checks` (each worth an equal share of the task's points) and a `solution` shown after submission. Keep the overall distribution close to the official weights, and validate every solution on a cluster before publishing.

## Cheat sheets (`content/cheatsheets/NN-<id>.yaml`)

Sections of entries with `title`, optional `description`, `code`, `lang` (`bash`, `yaml`, `text`, `json`) and `tags` (used by the filter and search). `order` sets the tab order.

## Publishing

1. `npm run content:check` and `npm run build -w @cka/web` pass.
2. Commit.
3. Build and deploy new images (see [DEPLOYMENT](DEPLOYMENT.md)). Progress is keyed by ids, so **never rename an id** of published content — users would lose their progress on it. Retire content by setting lessons back to `planned` or removing labs; old progress rows are simply ignored.
