const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { program } = require('commander');
const chalk = require('chalk');
const Table = require('cli-table3');

// Configure commander CLI options
program
  .name('git-fake-detector')
  .description('A forensics tool to detect artificially generated or backdated Git commits')
  .version('1.0.0')
  .option('-p, --path <path>', 'Path to target git repository', '.')
  .option('-t, --threshold <percentage>', 'Threshold percentage for flagging automation probability', '10')
  .option('-a, --author <email>', 'Filter analysis for a specific author email')
  .option('-v, --verbose', 'Show detailed table of all commits analyzed')
  .parse(process.argv);

const options = program.opts();

// Main function
function main() {
  const targetPath = path.resolve(options.path);
  
  // Verify target path exists
  if (!fs.existsSync(targetPath)) {
    console.error(chalk.red(`Error: Path '${targetPath}' does not exist.`));
    process.exit(1);
  }
  
  console.log(chalk.cyan(`\n🔍 Scanning repository at: ${chalk.bold(targetPath)}`));
  
  // Ingest data
  const commits = getRawCommitLog(targetPath);
  if (commits.length === 0) {
    console.log(chalk.yellow('⚠️ No commits found or failed to read git log.'));
    process.exit(0);
  }
  
  // Filter by author if specified
  let filteredCommits = commits;
  if (options.author) {
    const filterEmail = options.author.toLowerCase().trim();
    filteredCommits = commits.filter(c => 
      c.authorEmail.toLowerCase().includes(filterEmail) || 
      c.committerEmail.toLowerCase().includes(filterEmail)
    );
    console.log(chalk.cyan(`Filtering analysis for email containing: ${chalk.bold(options.author)} (${filteredCommits.length} commits)`));
    if (filteredCommits.length === 0) {
      console.log(chalk.yellow('⚠️ No commits matched the author filter.'));
      process.exit(0);
    }
  }
  
  // Run heuristic analysis
  const analysis = analyzeForensics(filteredCommits);
  
  // Print results
  printReport(analysis, filteredCommits, options.threshold);
}

// Data Ingestion Engine
function getRawCommitLog(repoPath) {
  // Extended format to capture author and committer names/emails, timezone offsets and subjects
  const format = '%H|%an|%ae|%cn|%ce|%aI|%cI|%s';
  try {
    const output = execSync('git log --pretty=format:"' + format + '"', {
      cwd: repoPath,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 50 // 50MB buffer to handle larger repositories
    });
    
    return output.split('\n').filter(Boolean).map(line => {
      const parts = line.split('|');
      if (parts.length < 8) return null;
      
      const hash = parts[0];
      const authorName = parts[1];
      const authorEmail = parts[2];
      const committerName = parts[3];
      const committerEmail = parts[4];
      const authorDate = parts[5];
      const committerDate = parts[6];
      const subject = parts.slice(7).join('|'); // Re-join if subject contains pipe characters
      
      return {
        hash,
        authorName,
        authorEmail,
        committerName,
        committerEmail,
        authorDate,
        committerDate,
        subject
      };
    }).filter(Boolean);
  } catch (error) {
    console.error(chalk.red(`Failed to parse local git log: ${error.message}`));
    return [];
  }
}

// Extract timezone offset (e.g., "+05:30", "-07:00", "Z") from ISO 8601 string
function getTimezoneOffset(dateStr) {
  if (!dateStr) return 'UTC';
  const match = dateStr.match(/([+-]\d{2}:\d{2}|Z)$/);
  return match ? match[0] : 'UTC';
}

// Forensic Analysis Engine
function analyzeForensics(commits) {
  let perfectZeroTracker = 0;
  const totalCommits = commits.length;
  
  // For burst detection, sort commits chronologically (oldest first)
  const sortedCommits = [...commits].sort((a, b) => new Date(a.committerDate) - new Date(b.committerDate));
  
  // Track last commit timestamp by author to check rapid-fire rate
  const lastCommitTimeByAuthor = {};
  
  const analyzedCommits = sortedCommits.map(c => {
    const aDate = new Date(c.authorDate);
    const cDate = new Date(c.committerDate);
    
    const seconds = cDate.getUTCSeconds();
    const minutes = cDate.getUTCMinutes();
    
    const isPerfectZero = (seconds === 0 && minutes === 0);
    const isZeroSeconds = (seconds === 0);
    
    if (isPerfectZero) {
      perfectZeroTracker++;
    }
    
    const reasons = [];
    let score = 0;
    
    // Heuristic 1: Perfect Zero Clock (from PDF)
    if (isPerfectZero) {
      reasons.push('Perfect Zero Clock (00m 00s)');
      score += 40;
    } else if (isZeroSeconds) {
      reasons.push('Zero Seconds (00s)');
      score += 15;
    }
    
    // Heuristic 2: Authorship Signature Mismatch
    const emailMismatch = c.authorEmail.toLowerCase() !== c.committerEmail.toLowerCase();
    const nameMismatch = c.authorName.toLowerCase() !== c.committerName.toLowerCase();
    if (emailMismatch || nameMismatch) {
      reasons.push(`Authorship Mismatch (${c.authorEmail} vs ${c.committerEmail})`);
      score += 20;
    }
    
    // Heuristic 3: Timezone Discrepancy
    const aOffset = getTimezoneOffset(c.authorDate);
    const cOffset = getTimezoneOffset(c.committerDate);
    if (aOffset !== cOffset) {
      reasons.push(`Timezone Offset Mismatch (${aOffset} vs ${cOffset})`);
      score += 25;
    }
    
    // Heuristic 4: Temporal Burst (High-Frequency)
    const authorKey = c.authorEmail.toLowerCase();
    const currentMs = cDate.getTime();
    if (lastCommitTimeByAuthor[authorKey]) {
      const diffSeconds = (currentMs - lastCommitTimeByAuthor[authorKey]) / 1000;
      if (diffSeconds >= 0 && diffSeconds < 5) {
        reasons.push(`Rapid Burst Commit (${diffSeconds.toFixed(1)}s since last)`);
        score += 30;
      }
    }
    lastCommitTimeByAuthor[authorKey] = currentMs;
    
    // Heuristic 5: Workhour Anomalies
    const localHour = cDate.getHours();
    if (localHour >= 1 && localHour <= 4) {
      reasons.push(`Suspicious Working Hour (${localHour}:00-${localHour + 1}:00)`);
      score += 10;
    }
    
    return {
      ...c,
      seconds,
      minutes,
      isPerfectZero,
      score,
      reasons,
      flagged: score >= 30
    };
  });
  
  const automationProbability = totalCommits > 0
    ? ((perfectZeroTracker / totalCommits) * 100).toFixed(2)
    : 0;
  
  return {
    totalCommits,
    perfectZeroTracker,
    automationProbability: parseFloat(automationProbability),
    analyzedCommits: analyzedCommits.reverse() // Reverse to show newest commits first
  };
}

// Report Formatting & Output
function printReport(analysis, commits, thresholdStr) {
  const threshold = parseFloat(thresholdStr);
  const total = analysis.totalCommits;
  const autoProb = analysis.automationProbability;
  
  console.log('\n' + chalk.bold.underline('📊 GIT FORENSICS REPORT SUMMARY'));
  
  const tableSummary = new Table({
    style: { head: [], border: [] }
  });
  
  tableSummary.push(
    [chalk.gray('Total Commits Analyzed'), chalk.bold(total)],
    [chalk.gray('Perfect Zero Clocks (00:00)'), chalk.bold(analysis.perfectZeroTracker)],
    [
      chalk.gray('Baseline Automation Probability'),
      autoProb >= threshold 
        ? chalk.red.bold(`${autoProb.toFixed(2)}% (Exceeds ${threshold}% threshold!)`) 
        : chalk.green.bold(`${autoProb.toFixed(2)}% (Below threshold)`)
    ]
  );
  
  console.log(tableSummary.toString());
  
  // Calculate repository status
  let repoStatus = chalk.green.bold('CLEAN (Low risk)');
  if (autoProb >= threshold || analysis.analyzedCommits.filter(c => c.score >= 40).length / total > 0.1) {
    repoStatus = chalk.red.bold('HIGH RISK (Likely automated or manipulated)');
  } else if (autoProb > threshold / 2 || analysis.analyzedCommits.filter(c => c.score >= 20).length / total > 0.15) {
    repoStatus = chalk.yellow.bold('MEDIUM RISK (Suspicious commit patterns detected)');
  }
  
  console.log(`\nOverall Repository Forensic Status: ${repoStatus}\n`);
  
  // Filter flagged or display all if verbose
  const flaggedCommits = analysis.analyzedCommits.filter(c => c.flagged);
  
  if (flaggedCommits.length === 0 && !options.verbose) {
    console.log(chalk.green('✓ No highly suspicious commits detected (all commits passed heuristic threshold).\n'));
    return;
  }
  
  const commitsToShow = options.verbose ? analysis.analyzedCommits : flaggedCommits;
  
  console.log(chalk.bold(`📋 DETAIL REPORT: ${commitsToShow.length} Commits Displayed` + (options.verbose ? '' : ' (Flagged Only)')));
  
  const detailTable = new Table({
    head: [
      chalk.cyan('Commit Hash'),
      chalk.cyan('Author / Committer Email'),
      chalk.cyan('Committer Date'),
      chalk.cyan('Score'),
      chalk.cyan('Flags / Reasons')
    ],
    colWidths: [12, 35, 25, 8, 45],
    wordWrap: true
  });
  
  commitsToShow.forEach(c => {
    let hashStr = c.hash.substring(0, 8);
    let scoreStr = c.score.toString();
    
    // Styling based on severity score
    if (c.score >= 40) {
      hashStr = chalk.red.bold(hashStr);
      scoreStr = chalk.red.bold(scoreStr);
    } else if (c.score >= 20) {
      hashStr = chalk.yellow(hashStr);
      scoreStr = chalk.yellow(scoreStr);
    } else {
      hashStr = chalk.green(hashStr);
      scoreStr = chalk.green(scoreStr);
    }
    
    const emailStr = c.authorEmail === c.committerEmail 
      ? chalk.white(c.authorEmail) 
      : `${chalk.yellow(c.authorEmail)} \n→ ${chalk.yellow(c.committerEmail)}`;
      
    const reasonsStr = c.reasons.length > 0 
      ? c.reasons.map(r => chalk.yellow(`• ${r}`)).join('\n') 
      : chalk.green('✓ None');
      
    detailTable.push([
      hashStr,
      emailStr,
      c.committerDate,
      scoreStr,
      reasonsStr
    ]);
  });
  
  console.log(detailTable.toString());
  console.log(chalk.gray(`Note: Commit scores >= 30 are automatically flagged. Use -v / --verbose to inspect all commits.\n`));
}

main();
