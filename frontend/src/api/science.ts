import { http } from './http';
import { API_BASE_URL } from '../config/env';

export interface MatchPair {
  user1: {
    id: number;
    email: string;
  };
  user2: {
    id: number;
    email: string;
  };
  matchScore: number;
  scoreBreakdown: {
    quiz: number;
    interests: number;
    proximity: number;
    ratings: number;
  };
  tier: string | null;
  distanceKm: number | null;
  sharedInterests: Array<{
    id: number;
    name: string;
  }>;
  sharedInterestCount: number;
  isMatched: boolean;
  matchState: string | null;
  matchedAt: string | null;
}

export interface MatchSpectrumResponse {
  pairs: MatchPair[];
  total: number;
  sampledAt: string | null;
}

export interface Interest {
  id: number;
  name: string;
  key: string;
  subject: string;
  totalUsers: number;
  percentage: number | null;
  correlations?: Array<{
    interestId: number;
    correlationScore: number;
    sharedUsers: number;
  }>;
}

export interface InterestsResponse {
  interests: Interest[];
  updatedAt: string | null;
}

export interface DailyStats {
  date: string;
  matchScoreDistribution: {
    '0-20': number;
    '20-40': number;
    '40-60': number;
    '60-80': number;
    '80-100': number;
  };
  avgMatchScore: number | null;
  medianMatchScore: number | null;
  totalMatchPairs: number;
  totalMatches: number;
  matchRate: number | null;
  avgDaysToMatch: number | null;
  avgInterestsPerUser: number | null;
  mostPopularInterests: Array<{
    id: number;
    name: string;
    count: number;
  }>;
}

export interface StatsResponse {
  stats: DailyStats[];
}

export const scienceApi = {
  getMatchSpectrum: async (params: {
    range?: 'best' | 'middle' | 'worst' | 'all';
    limit?: number;
    offset?: number;
  }): Promise<MatchSpectrumResponse> => {
    const urlParams = new URLSearchParams();
    if (params.range) urlParams.set('range', params.range);
    if (params.limit) urlParams.set('limit', String(params.limit));
    if (params.offset) urlParams.set('offset', String(params.offset));
    const query = urlParams.toString() ? `?${urlParams.toString()}` : '';
    return http<MatchSpectrumResponse>(
      `${API_BASE_URL}/api/science/match-spectrum${query}`,
      'GET'
    );
  },

  getInterests: async (params: {
    sortBy?: 'popularity' | 'name';
    limit?: number;
    withCorrelations?: boolean;
  }): Promise<InterestsResponse> => {
    const urlParams = new URLSearchParams();
    if (params.sortBy) urlParams.set('sortBy', params.sortBy);
    if (params.limit) urlParams.set('limit', String(params.limit));
    if (params.withCorrelations !== undefined) {
      urlParams.set('withCorrelations', params.withCorrelations ? 'true' : 'false');
    }
    const query = urlParams.toString() ? `?${urlParams.toString()}` : '';
    return http<InterestsResponse>(
      `${API_BASE_URL}/api/science/interests${query}`,
      'GET'
    );
  },

  getStats: async (days: number = 30): Promise<StatsResponse> => {
    const urlParams = new URLSearchParams();
    urlParams.set('days', String(days));
    const query = urlParams.toString() ? `?${urlParams.toString()}` : '';
    return http<StatsResponse>(
      `${API_BASE_URL}/api/science/stats${query}`,
      'GET'
    );
  }
};
