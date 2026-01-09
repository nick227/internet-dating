import { useState, useEffect, useCallback } from 'react';
import { scienceApi, type MatchPair, type Interest, type DailyStats } from '../../api/science';
import { useNavigate } from 'react-router-dom';

type RangeFilter = 'best' | 'middle' | 'worst' | 'all';

export function SciencePage() {
  const [range, setRange] = useState<RangeFilter>('best');
  const [pairs, setPairs] = useState<MatchPair[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [spectrumRes, interestsRes, statsRes] = await Promise.all([
        scienceApi.getMatchSpectrum({ range, limit: 50 }),
        scienceApi.getInterests({ sortBy: 'popularity', limit: 20 }),
        scienceApi.getStats(30)
      ]);

      setPairs(spectrumRes.pairs);
      setInterests(interestsRes.interests);
      setStats(statsRes.stats);
    } catch (err) {
      console.error('[SciencePage] Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="science-page">
        <div className="science-loading">Loading Science page...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="science-page">
        <div className="science-error">
          <h2>Error Loading Data</h2>
          <p>{error}</p>
          <button onClick={loadData} className="actionBtn">Retry</button>
        </div>
      </div>
    );
  }

  const latestStats = stats[0];

  return (
    <>
    <header className="science-header">
      <button className="actionBtn btn-small" onClick={() => nav('/profiles/search')}>Back</button>
    </header>
    <div className="science-page">
      {latestStats && (
        <section className="science-section science-overview">
          <h2>Platform Overview</h2>
          <div className="science-stat-grid">
            <div className="science-stat-card">
              <div className="science-stat-value">
                {latestStats.avgMatchScore != null ? Number(latestStats.avgMatchScore).toFixed(1) : 'N/A'}
              </div>
              <div className="science-stat-label">Avg Match Score</div>
            </div>
            <div className="science-stat-card">
              <div className="science-stat-value">
                {latestStats.totalMatchPairs.toLocaleString()}
              </div>
              <div className="science-stat-label">Total Match Pairs</div>
            </div>
            <div className="science-stat-card">
              <div className="science-stat-value">
                {latestStats.totalMatches.toLocaleString()}
              </div>
              <div className="science-stat-label">Active Matches</div>
            </div>
            <div className="science-stat-card">
              <div className="science-stat-value">
                {latestStats.matchRate != null ? Number(latestStats.matchRate).toFixed(1) : 'N/A'}%
              </div>
              <div className="science-stat-label">Match Rate</div>
            </div>
          </div>

          <div className="science-distribution">
            <h3>Match Score Distribution</h3>
            <div className="science-histogram">
              {Object.entries(latestStats.matchScoreDistribution).map(([bucket, count]) => {
                const maxCount = Math.max(...Object.values(latestStats.matchScoreDistribution));
                const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                return (
                  <div key={bucket} className="science-histogram-bar">
                    <div
                      className="science-histogram-fill"
                      style={{ height: `${height}%` }}
                      title={`${count} pairs`}
                    />
                    <div className="science-histogram-label">{bucket}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="science-section science-spectrum">
        <h2>Match Quality Spectrum</h2>
        <div className="science-range-filter">
          <button
            className={range === 'best' ? 'active' : ''}
            onClick={() => setRange('best')}
          >
            Best Matches
          </button>
          <button
            className={range === 'middle' ? 'active' : ''}
            onClick={() => setRange('middle')}
          >
            Middle Range
          </button>
          <button
            className={range === 'worst' ? 'active' : ''}
            onClick={() => setRange('worst')}
          >
            Worst Matches
          </button>
          <button
            className={range === 'all' ? 'active' : ''}
            onClick={() => setRange('all')}
          >
            All
          </button>
        </div>

        <div className="science-pairs-list">
          {pairs.length === 0 ? (
            <div className="science-empty">No match pairs found for this range</div>
          ) : (
            pairs.map((pair) => (
              <div
                key={`${pair.user1.id}-${pair.user2.id}`}
                className={`science-pair-card ${range === 'best' ? 'best' : range === 'worst' ? 'worst' : ''}`}
              >
                <div className="science-pair-header">
                  <div className="science-pair-users">
                    <span className="science-user">User {pair.user1.id}</span>
                    <span className="science-connector">↔</span>
                    <span className="science-user">User {pair.user2.id}</span>
                  </div>
                  <div className="science-pair-score">
                    {pair.matchScore.toFixed(1)}
                    {pair.isMatched && <span className="science-matched-badge">✓ Matched</span>}
                  </div>
                </div>

                <div className="science-pair-breakdown">
                  <div className="science-breakdown-item">
                    <div className="science-breakdown-label">Quiz</div>
                    <div className="science-breakdown-bar">
                      <div
                        className="science-breakdown-fill science-breakdown-quiz"
                        style={{ width: `${(pair.scoreBreakdown.quiz / 100) * 100}%` }}
                      />
                    </div>
                    <div className="science-breakdown-value">{pair.scoreBreakdown.quiz.toFixed(1)}</div>
                  </div>

                  <div className="science-breakdown-item">
                    <div className="science-breakdown-label">Interests</div>
                    <div className="science-breakdown-bar">
                      <div
                        className="science-breakdown-fill science-breakdown-interests"
                        style={{ width: `${(pair.scoreBreakdown.interests / 100) * 100}%` }}
                      />
                    </div>
                    <div className="science-breakdown-value">{pair.scoreBreakdown.interests.toFixed(1)}</div>
                  </div>

                  <div className="science-breakdown-item">
                    <div className="science-breakdown-label">Proximity</div>
                    <div className="science-breakdown-bar">
                      <div
                        className="science-breakdown-fill science-breakdown-proximity"
                        style={{ width: `${(pair.scoreBreakdown.proximity / 100) * 100}%` }}
                      />
                    </div>
                    <div className="science-breakdown-value">{pair.scoreBreakdown.proximity.toFixed(1)}</div>
                  </div>

                  <div className="science-breakdown-item">
                    <div className="science-breakdown-label">Ratings</div>
                    <div className="science-breakdown-bar">
                      <div
                        className="science-breakdown-fill science-breakdown-ratings"
                        style={{ width: `${(pair.scoreBreakdown.ratings / 100) * 100}%` }}
                      />
                    </div>
                    <div className="science-breakdown-value">{pair.scoreBreakdown.ratings.toFixed(1)}</div>
                  </div>
                </div>

                {pair.sharedInterests.length > 0 && (
                  <div className="science-pair-interests">
                    <strong>Shared interests ({pair.sharedInterestCount}):</strong>{' '}
                    {pair.sharedInterests.slice(0, 5).map(i => i.name).join(', ')}
                    {pair.sharedInterests.length > 5 && ` +${pair.sharedInterests.length - 5} more`}
                  </div>
                )}

                {pair.distanceKm !== null && (
                  <div className="science-pair-meta">
                    Distance: {pair.distanceKm.toFixed(1)} km
                    {pair.tier && ` • Tier: ${pair.tier}`}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="science-section science-interests">
        <h2>Top Interests</h2>
        <div className="science-interests-grid">
          {interests.slice(0, 10).map((interest) => (
            <div key={interest.id} className="science-interest-card">
              <div className="science-interest-name">{interest.name}</div>
              <div className="science-interest-stats">
                <span>{interest.totalUsers.toLocaleString()} users</span>
                {interest.percentage != null && (
                  <span className="science-interest-percentage">
                    {Number(interest.percentage).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
    </>
  );
}
