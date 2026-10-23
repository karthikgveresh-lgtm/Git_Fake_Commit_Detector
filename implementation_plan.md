# Git Fake Commits Detector Implementation Plan

The objective of this project is to construct a behavioral forensics analysis pipeline running on Node.js that parses Git logs to identify artificially generated or backdated commits. The program evaluates irregularities across time zones, clock perfectness (zero-second/minute executions), high frequency, and authorship signatures.

We will initialize a Node.js project, install the required CLI and styling dependencies (`commander`, `chalk`, `cli-table3`), and implement a command-line tool `detector.js` that implements the ingestion, heuristics, and reporting phases.

## User Review Required

> [!IMPORTANT]
> The PDF provides a basic commit log format: `%H|%ae|%aI|%cI|%s` which parses `[hash, email, authorDate, committerDate, subject]`.
> To fully support **Authorship Signatures** checking (mismatch between Author and Committer) and **File Change Complexity (Entropy)**, we propose extending the ingestion engine:
> 1. Extend the format string to `%H|%an|%ae|%cn|%ce|%aI|%cI|%s` to capture both Author Name/Email and Committer Name/Email.
> 2. Use a heuristic detection framework that combines multiple criteria (perfect zero clock, author/committer mismatch, rapid-fire commits, timezone offsets) to compute a multi-factor anomaly score.

## Open Questions

> [!NOTE]
> 1. Should the tool run recursively on a directory, or should it target the current git repository by default, with an option to specify a target repository directory path? (We propose default to current directory, with a `-p, --path <path>` option).
> 2. What should be the default threshold percentage for flagging a repository or author as highly likely automated? (We propose flagging any repository with an automation probability > 10% or individual authors exceeding that threshold).

---

## Proposed Changes

### Configuration & Dependencies

#### [NEW] [package.json](file:///c:/Users/91733/Desktop/Git_Fake_Detector/package.json)
Initializes the Node.js project and specifies dependencies:
* `commander`: For CLI option parsing.
* `chalk`: For colored console output.
* `cli-table3`: For drawing clean, structured tables of flagged commits in the terminal.

---

### Core Pipeline

#### [NEW] [detector.js](file:///c:/Users/91733/Desktop/Git_Fake_Detector/detector.js)
Contains the main logic divided into four modules:
1. **CLI Definition**: Set up commands and arguments using `commander`.
2. **Git Data Ingestion**: Spawns `git log` and parses output.
3. **Forensic Analysis Engine**: Runs heuristic checks on the commit collection:
   - **Zero-Second and Zero-Minute checks**: High probability of automated scripts running on cron schedules.
   - **Timezone Mismatch**: Highlights differences between author date timezone and committer date timezone.
   - **Authorship Mismatch**: Identifies discrepancies between the author identity and committer identity.
   - **High-Frequency Bursts**: Flags multiple commits made within a tiny window (e.g. < 5 seconds) by the same user.
4. **Reporter**: Generates a terminal report using `cli-table3` and `chalk`.

---

## Verification Plan

### Automated Tests
We will write a verification test script in `scratch/test_detector.js` that:
1. Sets up a temporary mock git repository.
2. Creates normal commits (with varied seconds and matching author/committer).
3. Creates artificial commits (with zero seconds/minutes, differing committer info, or backdated dates).
4. Runs `node detector.js` pointing to this repository and verifies that the tool correctly flags the suspicious commits.

### Manual Verification
- We will run the tool on its own repository (`node detector.js`) or another local repository to verify execution.
- We will test all CLI arguments:
  - `node detector.js --help`
  - `node detector.js --path .`
  - `node detector.js --threshold 15`
