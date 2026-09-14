# Issue tracker: GitHub

Issues and specs live in GitHub Issues:
`benjamin-qhy/qiushuiai-airadar`

Use the `gh` CLI and explicitly include:
`--repo benjamin-qhy/qiushuiai-airadar`

## Common operations

- Create: `gh issue create --repo benjamin-qhy/qiushuiai-airadar`
- Read: `gh issue view <number> --comments --repo benjamin-qhy/qiushuiai-airadar`
- List: `gh issue list --repo benjamin-qhy/qiushuiai-airadar`
- Comment: `gh issue comment <number> --repo benjamin-qhy/qiushuiai-airadar`
- Label: `gh issue edit <number> --add-label "..." --repo benjamin-qhy/qiushuiai-airadar`
- Close: `gh issue close <number> --repo benjamin-qhy/qiushuiai-airadar`

## Pull requests as a triage surface

PRs as a request surface: no.

## Skill conventions

When a skill says "publish to the issue tracker", create a GitHub issue.
When a skill says "fetch the relevant ticket", read that GitHub issue.

For `/wayfinder`, use one `wayfinder:map` issue as the map and linked
sub-issues as child tickets. Use GitHub's native dependencies when available.
