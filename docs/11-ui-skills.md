UI skills and plugins
Skills and plugins that help Codex and Claude Code build a UI for KIRA that doesn't look AI-generated. Checked on 4 November 2026, from the skills already on Taufiq's machine, OpenAI's Codex plugin catalog, Anthropic's catalog, Vercel's, and the most-recommended community skills. The file UI skills.zip next to this document holds copies of the free skills that are plain Markdown, ready to unzip into a repo's .agents/skills/.
The rule that matters most: one design direction, written down once (DESIGN.md), plus one review step before every merge. Stacking four "taste" skills gives Codex contradictory rules, and the mush that comes out is its own kind of AI slop.
Install these (core)
#
	Skill or plugin
	What it does for KIRA
	Codex
	Claude Code

	1
	Impeccable (pbakaus/impeccable, Apache 2.0, about 100k GitHub stars)
	The most recommended anti-slop design skill. Built on Anthropic's frontend-design, adds references for type, colour, spacing, motion, interaction, responsive, UX writing, a list of AI-design anti-patterns, and commands: shape and init (write the design context), critique (scored UX review), audit (technical quality), polish, distill, typeset, layout, clarify, harden, adapt. Its detector checks 62 slop rules without an LLM.
	From the repo root: npx impeccable install, choose Codex, approve the hook in /hooks, then $impeccable init
	/plugin marketplace add pbakaus/impeccable, then install it from /plugin; or npx impeccable install
	2
	KIRA's DESIGN.md, written with awesome-design-md (in UI skills.zip)
	One design system for four people and every Codex task. Start from the starter in document 10; borrow from designs/wise.md (fintech, green, trust) and designs/stripe.md (dense financial data).
	Copy the skill to .agents/skills/; ask "write DESIGN.md for KIRA from docs/10 and designs/wise.md"
	Same, in .claude/skills/
	3
	web-design-guidelines (Vercel, in UI skills.zip)
	Review before merging: 100+ rules on accessibility, focus, forms, tables, numbers, performance; answers as file:line. Needs internet (it fetches the latest rules).
	Copy to .agents/skills/, or npx skills add vercel-labs/agent-skills
	Same, or the local copy
	4
	Data visualisation: OpenAI build-web-data-visualization (Codex) · dataviz (Claude, already in your account)
	The ring, the matrix heat map, the learning bars, trend lines and KPI tiles: chart choice, colour, labels, accessibility. Use dashboards-and-real-time-visualization, visualization-strategy-and-critique and accessibility-and-inclusive-visualization.
	codex plugin add build-web-data-visualization@openai-curated-remote
	dataviz is built in
	Use when needed
Skill or plugin
	When
	Install

	OpenAI build-web-apps (Codex)
	frontend-app-builder for a new screen; frontend-testing-debugging to open the page, read the console, check responsive layout and visual QA; react-best-practices; shadcn-best-practices if you use shadcn (restyle it from DESIGN.md first)
	codex plugin add build-web-apps@openai-curated-remote
	OpenAI product-design (Codex)
	audit: screenshots a flow and reports UX and accessibility issues; design-qa: compares a built screen with its target image; image-to-code: builds a screen from a design image. Don't use url-to-code on kira.madgun.us at the event (it copies the old front end).
	codex plugin add product-design@openai-curated-remote
	Anthropic frontend-design
	The original anti-generic skill. Only if Impeccable can't run (it ships a small engine binary and a hook; blocked laptops). Don't install both.
	npx skills add anthropics/skills --skill frontend-design --agent codex · Claude Code: /plugin install frontend-design@claude-plugins-official
	redesign-existing-projects (UI skills.zip)
	The later "improve the UI" pass: audits first, then upgrades without breaking behaviour
	Unzip into .agents/skills/
	design-taste-frontend (Taste Skill, in UI skills.zip)
	Landing and login pages: anti-slop with dials for variance, motion and density (set motion low for KIRA)
	Unzip into .agents/skills/
	minimalist-ui or high-end-visual-design (UI skills.zip)
	A style reference. KIRA's calm, flat look is closest to minimalist-ui. Use one, not both, and not on top of Impeccable's direction
	Unzip into .agents/skills/
	full-output-enforcement (UI skills.zip)
	Stops Codex from leaving "rest unchanged" placeholders in big files
	Unzip into .agents/skills/
	Figma (Codex plugin)
	Only if someone designs screens in Figma first
	codex plugin add figma@openai-curated-remote
	Skip for KIRA
* gpt-taste: GSAP scroll effects for marketing landing pages.
* industrial-brutalist-ui: the wrong mood for a tool finance teams have to trust.
* brandkit, imagegen-frontend-mobile, imagegen-frontend-web: they generate images, not UI.
* stitch-design-taste: only if you design in Google Stitch.
* design-taste-frontend-v1: replaced by design-taste-frontend.
* UI/UX Pro Max (nextlevelbuilder): useful when you have no direction at all; KIRA has one, and it adds a Python CLI.
Where skills go
* Codex reads skills from .agents/skills/ in the working folder and every parent up to the repo root, and from ~/.agents/skills/. Restart Codex after adding one. $skill-installer installs skills from a GitHub repo. Plugins: codex plugin add NAME@openai-curated-remote (codex plugin list shows them).
* Claude Code reads .claude/skills/ in the project and ~/.claude/skills/; plugins through /plugin.
* On Taufiq's homelab they are already installed in ~/Projects/.agents/skills (linked from ~/Projects/.claude/skills), so any repo under ~/Projects has them. On a teammate's laptop: unzip UI skills.zip into the new repo's .agents/skills/ and commit them, so every Codex session on the team gets the same rules.
* Skills are instructions, not KIRA code, but they are things brought from outside: mention them if the organisers ask.
Workflow
1. Before the event (once): run Impeccable's shape and init on the KIRA brief (00, 01) and document 10 → write DESIGN.md (tokens, type scale, components, do and don't) → commit it with an AGENTS.md line: "Follow DESIGN.md. Run the anti-slop checklist before saying a screen is done."
2. Every screen during the build: the Codex task names the contract section, the screenshot in docs/screens/, and DESIGN.md. When it's built: $impeccable critique, then $impeccable audit, fix, then the web-design-guidelines review, then a screenshot next to the reference.
3. Charts: the dataviz skills, with the palette from DESIGN.md; status colours only for status.
4. The later improvement pass: redesign-existing-projects to audit the whole app → Impeccable polish, typeset, layout and distill per screen → the dataviz critique on every chart → web-design-guidelines on everything.
Anti-slop checklist for KIRA
Run on every screen before it's merged.
* ☐ One accent colour (green). Amber and red mean status and nothing else. No gradients, glass, glow or coloured shadows.
* ☐ Two typefaces at most, from the DESIGN.md scale. Nothing under 12 px for content. Numbers in tabular figures, right-aligned, in one format (Rp 9.031.421).
* ☐ No spaced all-caps eyebrow over every title, no middle-dot strings, no label that repeats its content.
* ☐ Not everything in a card. Tables sit on the page; no cards inside cards.
* ☐ Copy says what's on the screen with real numbers ("142 sales not in the bank yet, Rp 9.031.421"), never a slogan.
* ☐ Every table has loading, empty (with the next step) and error states.
* ☐ Motion only in answer to an action; reduced motion respected.
* ☐ Visible keyboard focus, AA contrast, works at 1280 px and on a tablet.
* ☐ Nothing floats over data (the chat button included).
* ☐ Looked at in the browser (screenshot), not just in code.
Sources
* Impeccable: github.com/pbakaus/impeccable
* Anthropic frontend-design: github.com/anthropics/skills (skills/frontend-design)
* Vercel agent skills (web-design-guidelines): github.com/vercel-labs/agent-skills
* Taste Skill (design-taste-frontend): github.com/Leonxlnx/taste-skill
* UI/UX Pro Max: github.com/nextlevelbuilder/ui-ux-pro-max-skill
* OpenAI Codex skills: learn.chatgpt.com/docs/build-skills; Codex plugin catalog: codex plugin list
* Roundups used to cross-check: composio.dev/content/top-claude-skills, firecrawl.dev/blog/best-claude-code-skills, chaseai.io/blog/claude-code-frontend-design-skills
