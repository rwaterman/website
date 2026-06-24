// Resume source. Compile to public/resume.pdf with `npm run resume`
// (requires Typst: `brew install typst`). Replace every PLACEHOLDER below with
// your own content — nothing here is real. Live-preview while editing with
// `npm run resume:watch`.

#set document(title: "Rick Waterman — Resume", author: "Rick Waterman")
#set page(paper: "us-letter", margin: (x: 1.6cm, y: 1.5cm))
#set text(size: 10.5pt)
#set par(leading: 0.62em)
#show link: it => underline(text(rgb("#4f46e5"), it))

#show heading.where(level: 2): it => [
  #v(0.6em)
  #text(size: 11pt, weight: "bold", upper(it.body))
  #v(-0.35em)
  #line(length: 100%, stroke: 0.5pt + gray)
]

// One experience/education row: title + org on the left, dates on the right.
#let entry(title, org, dates, body) = {
  grid(
    columns: (1fr, auto),
    [*#title* — #org],
    align(right, text(fill: gray, dates)),
  )
  body
}

// === Header ===
#align(center)[
  #text(size: 20pt, weight: "bold")[Rick Waterman] \
  #text(fill: gray)[Lead Cloud Architect] \
  #v(0.2em)
  #link("mailto:you@example.com")[you\@example.com]
  · #link("https://github.com/rwaterman")[github.com/rwaterman]
  · #link("https://rickgwaterman.com")[rickgwaterman.com]
]

#v(0.4em)

== Summary
PLACEHOLDER — one or two sentences on who you are and what you do. Replace this
with your own summary.

== Experience
#entry("Job Title", "Company Name", "20XX – Present")[
  - PLACEHOLDER accomplishment with a measurable outcome.
  - PLACEHOLDER responsibility or system you owned.
]
#v(0.5em)
#entry("Job Title", "Previous Company", "20XX – 20XX")[
  - PLACEHOLDER accomplishment.
  - PLACEHOLDER accomplishment.
]

== Skills
*Cloud / Infra:* PLACEHOLDER (e.g. AWS, Lambda, CDK, Terraform) \
*Languages:* PLACEHOLDER (e.g. TypeScript, Python) \
*Data:* PLACEHOLDER

== Education
#entry("Degree", "Institution", "20XX")[]
