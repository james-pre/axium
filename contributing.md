# Contributing

This document covers how you can contribute to Axium and how to work with the project's tooling.

## Discussions, issues and pull requests

When opening an issue or discussion, write a short descriptive name for the title.
Putting the first line of an error stack trace is _not_ a descriptive title.
You do not need to triage the issue or PR, a maintainer will give it the applicable tags.

Please copy logs, terminal output, and code into a code block in the issue or PR.
Do not include screenshots since those are very difficult to debug.

### Issues vs Discussions

Issues are used to track bugs and features.
For anything else you probably want to open a discussion.

### Bug Reports

When submitting a bug report, you must submit a [Minimal reproducible example](https://en.wikipedia.org/wiki/Minimal_reproducible_example) that does not depend on third party code.
Failing to provide one may lead to delays in resolving the issue or outright closure.

## Code Style

#### Nesting

- Avoid [callback hell](http://callbackhell.com/)
    - Use `async`/`await` for asynchronous code
- Use [guard clauses](<https://en.wikipedia.org/wiki/Guard_(computer_science)>) to reduce indentation
- If you're more of a visual learner, this video is helpful: [Why You Shouldn't Nest Your Code](https://youtu.be/CFRhGnuXG-4)

#### Naming things

- Don't use single letter variable names, with the exception of traditions like `i` in `for` loops
- Don't abbreviate in variable names
- Don't put types in variable names, it already has a type
- Don't put units in your variable names, but do include units in documentation if the type does not abstract the unit
    - Example #1: A variable `time: Date` doesn't need a unit because `Date` encapsulates units
    - Example #2: A variable `time: number` will need a unit in documentation, since it could be seconds, minutes, etc.
- Don't put types in types, for example prefixing an interface name with "I"
- Don't name a class "Base" or "Abstract"

The [Naming Things in Code](https://youtu.be/-J3wNP6u5YU) video covers everything, though you should keep in mind:

- Units will go into documentation if they are needed
- Bend the utils recommendation since some code can't be attributed to some other piece of code, it really is just a utility.

#### Documentation

For the different functions and variables, write a short description of what it does and how it should be used.
I certainly haven't been the best about doing this, so if you find missing or outdated documentation an issue or PR would be welcome.

## NPM vs 3rd party package managers

`npm` is used rather than `pnpm` or `yarn` since it makes it easier for new contributors and simplifies tooling.

## Building

You can build the project with `npm run build` or simply `npx tsc --build`.

## Formatting

You can automatically run formatting with the `npm run format` command

Tabs are used in formatting since they take up less space in files, in addition to making it easier to work with.
You can't accidentally click the wrong space then have to move around trying to delete the single tab width of indentation.

Trailing commas are used to reduce the amount of individual line changes in commits, which helps to improve clarity and commit diffs. For example:

```diff
const someObject = {
	a: 1,
	b: 2,
+	c: 3,
}

```

instead of

```diff
const someObject = {
	a: 1,
-	b: 2
+	b: 2,
+	c: 3
}

```

Styling is aimed at improving developer experience.
If you make changes to formatting, make sure they improve the development experience.

## Frontend Design Guidelines

- Buttons should capitalize like sentences: "Upload folder" is correct, "Upload Folder" is not.
