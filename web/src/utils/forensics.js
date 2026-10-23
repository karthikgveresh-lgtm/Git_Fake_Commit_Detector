export function getTimezoneOffset(dateStr) {
  if (!dateStr) return 'UTC';
  const match = dateStr.match(/([+-]\d{2}:\d{2}|Z)$/);
  return match ? match[0] : 'UTC';
}

export function analyzeForensics(githubCommits) {
  let perfectZeroTracker = 0;
  const totalCommits = githubCommits.length;

  // Map GitHub nested objects to our flat commit structure
  const flatCommits = githubCommits.map(gc => {
    const c = gc.commit || {};
    return {
      hash: gc.sha || '',
      authorName: c.author?.name || 'Unknown',
      authorEmail: c.author?.email || 'unknown@example.com',
      committerName: c.committer?.name || 'Unknown',
      committerEmail: c.committer?.email || 'unknown@example.com',
      authorDate: c.author?.date || '',
      committerDate: c.committer?.date || '',
      subject: c.message || ''
    };
  });

  // Sort oldest first for burst detection
  const sortedCommits = [...flatCommits].sort((a, b) => new Date(a.committerDate) - new Date(b.committerDate));

  const lastCommitTimeByAuthor = {};

  const analyzedCommits = sortedCommits.map(c => {
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

    // Heuristic 1: Perfect Zero Clock
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

    // Heuristic 5: Workhour Anomalies (1 AM - 4 AM local time)
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
    analyzedCommits: analyzedCommits.reverse() // Newest commits first
  };
}
