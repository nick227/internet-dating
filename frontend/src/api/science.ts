import { client } from './client';

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
    const response = await client.get('/science/match-spectrum', { params });
    return response.data;
  },

  getInterests: async (params: {
    sortBy?: 'popularity' | 'name';
    limit?: number;
    withCorrelations?: boolean;
  }): Promise<InterestsResponse> => {
    const response = await client.get('/science/interests', {
      params: {
        ...params,
        withCorrelations: params.withCorrelations ? 'true' : 'false'
      }
    });
    return response.data;
  },

  getStats: async (days: number = 30): Promise<StatsResponse> => {
    const response = await client.get('/science/stats', {
      params: { days }
    });
    return response.data;
  }
};
