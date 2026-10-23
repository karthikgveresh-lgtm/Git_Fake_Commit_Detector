import React, { useState } from 'react';
import { 
  ShieldAlert, Search, Settings, RefreshCw, AlertTriangle, 
  CheckCircle2, Info, GitCommit, Clock, ArrowRight, ExternalLink 
} from 'lucide-react';
import { analyzeForensics } from './utils/forensics';
import './App.css';

function App() {
  const [repoUrl, setRepoUrl] = useState('');
  const [token, setToken] = useState('');
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [filterType, setFilterType] = useState('all'); // 'all' | 'flagged'

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setLoading(true);
    setError(null);
    setReport(null);

    // Extract owner and repo from Github URL
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      setError("Invalid GitHub URL. Please paste a public URL like: https://github.com/owner/repo");
      setLoading(false);
      return;
    }

    const owner = match[1];
    // Strip trailing .git if present
    const repo = match[2].replace(/\.git$/, '');

    try {
      let allCommits = [];
      let page = 1;
      const perPage = 100;
      const maxPages = Math.ceil(limit / perPage);

      while (page <= maxPages) {
        const fetchUrl = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${perPage}&page=${page}`;
        const headers = {
          'Accept': 'application/vnd.github.v3+json'
        };
        if (token.trim()) {
          headers['Authorization'] = `token ${token.trim()}`;
        }

        const res = await fetch(fetchUrl, { headers });
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error("GitHub API rate limit exceeded or access forbidden. Please add a Personal Access Token in Settings to increase rate limits.");
          } else if (res.status === 404) {
            throw new Error("Repository not found. Please make sure the repository is public and the URL is spelled correctly.");
          } else {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.message || `Failed to fetch repository commits (HTTP ${res.status}).`);
          }
        }

        const data = await res.json();
        if (data.length === 0) break;
        allCommits = allCommits.concat(data);
        if (data.length < perPage) break;
        page++;
      }

      if (allCommits.length === 0) {
        throw new Error("This repository has no commits.");
      }

      // Run forensic analysis
      const analysisResult = analyzeForensics(allCommits);
      setReport({
        owner,
        repo,
        ...analysisResult
      });
    } catch (err) {
      console.error(err);
      setError(err.message || "An unexpected error occurred while fetching commits.");
    } finally {
      setLoading(false);
    }
  };

  // Derived state for metrics
  const totalCount = report ? report.totalCommits : 0;
  const fakeCommitsList = report ? report.analyzedCommits.filter(c => c.flagged) : [];
  const fakeCount = fakeCommitsList.length;
  const originalCount = totalCount - fakeCount;
  const autoProb = report ? report.automationProbability : 0;

  // Determine repository risk level
  let riskLevel = 'LOW RISK';
  let riskClass = 'status-low';
  let riskExplanation = 'This repository exhibits standard human commit behaviors with minimal anomalies.';
  
  if (report) {
    const highRiskDensity = report.analyzedCommits.filter(c => c.score >= 40).length / totalCount;
    if (autoProb >= 10 || highRiskDensity > 0.1) {
      riskLevel = 'HIGH RISK';
      riskClass = 'status-high';
      riskExplanation = 'Highly suspicious pattern detected. Strong evidence of automated commits, backdated actions, or looping pipelines.';
    } else if (autoProb > 5 || report.analyzedCommits.filter(c => c.score >= 20).length / totalCount > 0.15) {
      riskLevel = 'MEDIUM RISK';
      riskClass = 'status-medium';
      riskExplanation = 'Moderate irregularities detected, such as authorship mismatches or timezone alterations. Worth auditing.';
    }
  }

  // Filter commits for details table
  const displayedCommits = report 
    ? (filterType === 'flagged' ? fakeCommitsList : report.analyzedCommits)
    : [];

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-container">
          <ShieldAlert size={40} className="logo-icon" />
          <h1 className="app-title">Git Fake Commits Detector</h1>
        </div>
        <p className="app-subtitle">
          An advanced behavioral forensics pipeline to detect artificially generated, automated, or backdated Git commits in any public repository.
        </p>
      </header>

      {/* Search and Settings Card */}
      <div className="glass-panel search-card">
        <form onSubmit={handleSearch} className="search-form">
          <div className="input-wrapper">
            <Search size={20} className="search-icon" />
            <input 
              type="text" 
              placeholder="Paste public GitHub URL (e.g. https://github.com/karthikgveresh-lgtm/daily-log)" 
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="search-input"
              disabled={loading}
            />
          </div>
          <button 
            type="button" 
            onClick={() => setShowSettings(!showSettings)} 
            className="settings-toggle-btn"
            title="Configure settings"
            disabled={loading}
          >
            <Settings size={20} className={showSettings ? 'spinner' : ''} />
          </button>
          <button 
            type="submit" 
            className="btn-primary" 
            disabled={loading || !repoUrl.trim()}
          >
            {loading ? (
              <>
                <RefreshCw size={18} className="spinner" />
                Analyzing...
              </>
            ) : (
              'Analyze Repo'
            )}
          </button>
        </form>

        {/* Hidden Settings Row */}
        {showSettings && (
          <div className="settings-panel">
            <h3 className="settings-title">Scan Configuration</h3>
            <div className="settings-row">
              <div className="form-group">
                <label className="form-label">GitHub Personal Access Token (Optional)</label>
                <input 
                  type="password" 
                  placeholder="Paste GitHub PAT to avoid rate-limiting" 
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="settings-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Commit Scan Limit</label>
                <select 
                  value={limit} 
                  onChange={(e) => setLimit(Number(e.target.value))} 
                  className="settings-input"
                >
                  <option value={100}>Last 100 commits (1 page - fastest)</option>
                  <option value={200}>Last 200 commits (2 pages)</option>
                  <option value={300}>Last 300 commits (3 pages)</option>
                </select>
              </div>
            </div>
            <p className="metric-desc" style={{ marginTop: '0.25rem' }}>
              💡 Unauthenticated scans are limited to 60 requests/hr by GitHub. Providing a Personal Access Token increases your limit to 5000/hr.
            </p>
          </div>
        )}
      </div>

      {/* Error Card */}
      {error && (
        <div className="error-card">
          <AlertTriangle size={24} className="error-icon" />
          <div className="error-details">
            <strong>Analysis Failed:</strong> {error}
          </div>
        </div>
      )}

      {/* Loading Block */}
      {loading && (
        <div className="glass-panel loading-card">
          <RefreshCw size={56} className="spinner" />
          <p className="loading-text">Ingesting commit logs and running behavioral forensic heuristic checks...</p>
        </div>
      )}

      {/* Dashboard Grid */}
      {report && !loading && (
        <div className="dashboard-grid">
          
          {/* Section 1: 3 Columns Metrics Row */}
          <div className="metrics-row">
            
            {/* Column 1: Total Commits */}
            <div className="glass-panel metric-card metric-total">
              <div className="metric-header">
                Total Commits
                <GitCommit size={20} className="icon-cyan" />
              </div>
              <div className="metric-value">{totalCount}</div>
              <div className="metric-desc">Commits retrieved and scanned in this scan window.</div>
            </div>

            {/* Column 2: Original Commits */}
            <div className="glass-panel metric-card metric-original">
              <div className="metric-header">
                Original Commits
                <CheckCircle2 size={20} className="icon-green" />
              </div>
              <div className="metric-value">{originalCount}</div>
              <div className="metric-desc">Commits that passed all automation heuristic filters cleanly.</div>
            </div>

            {/* Column 3: Fake Commits */}
            <div className="glass-panel metric-card metric-fake">
              <div className="metric-header">
                Fake Commits
                <ShieldAlert size={20} className="icon-red" />
              </div>
              <div className="metric-value">{fakeCount}</div>
              <div className="metric-desc">Commits flagged with high anomaly scores or rapid-fire actions.</div>
            </div>

          </div>

          {/* Section 2: Forensics Risk Gauge Summary */}
          <div className="glass-panel status-card">
            
            <div className="status-badge-container">
              <div className="status-label">Forensic Verdict</div>
              <div className={`status-badge ${riskClass}`}>{riskLevel}</div>
              <p className="status-explanation">{riskExplanation}</p>
            </div>

            <div className="progress-container">
              <div className="progress-label-row">
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Clock size={16} /> Baseline Automation Probability
                </span>
                <span className="probability-value">{autoProb.toFixed(2)}%</span>
              </div>
              
              <div className="progress-bar-bg">
                <div 
                  className={`progress-bar-fill ${autoProb >= 10 ? 'bar-high' : autoProb > 5 ? 'bar-medium' : 'bar-low'}`} 
                  style={{ width: `${Math.min(autoProb * 5, 100)}%` }} 
                />
                <div className="progress-threshold-marker" style={{ left: '50%' }} title="10% Risk Threshold" />
              </div>
              <div className="progress-threshold-label">
                Risk threshold marked at 10% perfect zero execution clock rate
              </div>
            </div>

          </div>

          {/* Section 3: Detail Commits Table Logs */}
          <div>
            <div className="table-header">
              <h2 className="table-title">🔍 Forensic Detail Logs</h2>
              <div className="table-controls">
                <div className="filter-btn-group">
                  <button 
                    onClick={() => setFilterType('all')} 
                    className={`filter-btn ${filterType === 'all' ? 'active' : ''}`}
                  >
                    All Commits ({totalCount})
                  </button>
                  <button 
                    onClick={() => setFilterType('flagged')} 
                    className={`filter-btn ${filterType === 'flagged' ? 'active' : ''}`}
                  >
                    Flagged Only ({fakeCount})
                  </button>
                </div>
              </div>
            </div>

            <div className="glass-panel table-card">
              <div className="table-responsive">
                <table className="commits-table">
                  <thead>
                    <tr>
                      <th style={{ width: '12%' }}>Commit Hash</th>
                      <th style={{ width: '30%' }}>Author / Committer Email</th>
                      <th style={{ width: '22%' }}>Committer Date</th>
                      <th style={{ width: '8%', textAlign: 'center' }}>Score</th>
                      <th style={{ width: '28%' }}>Forensic Flags / Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedCommits.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="empty-table-state">
                          <Info size={32} style={{ marginBottom: '0.75rem', opacity: 0.6 }} />
                          <br />
                          No commits match this filter criteria.
                        </td>
                      </tr>
                    ) : (
                      displayedCommits.map((c) => {
                        const isFlagged = c.score >= 30;
                        const scoreSeverity = c.score >= 40 ? 'high' : c.score >= 20 ? 'medium' : 'low';
                        const hashRisk = c.score >= 40 ? 'high-risk' : c.score >= 20 ? 'medium-risk' : 'low-risk';
                        
                        return (
                          <tr key={c.hash} className={isFlagged ? 'row-flagged' : ''}>
                            {/* Hash */}
                            <td>
                              <a 
                                href={`https://github.com/${report.owner}/${report.repo}/commit/${c.hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`hash-cell ${hashRisk}`}
                                title="View on GitHub"
                              >
                                {c.hash.substring(0, 8)}
                                <ExternalLink size={10} style={{ marginLeft: '0.2rem', verticalAlign: 'middle' }} />
                              </a>
                            </td>
                            {/* Emails */}
                            <td>
                              <div className="email-cell">
                                <span className="email-value" title={c.authorName}>
                                  {c.authorEmail}
                                </span>
                                {c.authorEmail !== c.committerEmail && (
                                  <>
                                    <span className="email-mismatch-arrow">↳ committer:</span>
                                    <span className="email-value" title={c.committerName} style={{ opacity: 0.8 }}>
                                      {c.committerEmail}
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>
                            {/* Date */}
                            <td className="date-cell">
                              {c.committerDate}
                            </td>
                            {/* Score */}
                            <td className="score-cell">
                              <span className={`score-val ${scoreSeverity}`}>
                                {c.score}
                              </span>
                            </td>
                            {/* Flags */}
                            <td>
                              <div className="reasons-cell">
                                {c.reasons.length > 0 ? (
                                  c.reasons.map((r, index) => (
                                    <span 
                                      key={index} 
                                      className={`reason-bullet ${c.score >= 40 ? 'high' : ''}`}
                                    >
                                      <AlertTriangle size={12} /> {r}
                                    </span>
                                  ))
                                ) : (
                                  <span className="no-flag-check">
                                    <CheckCircle2 size={12} /> Passed Heuristics
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

export default App;
