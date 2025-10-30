import { pool } from '../config/database';

export interface AnalyticsEvent {
  userId: string;
  eventType: string;
  eventCategory: string;
  properties: Record<string, any>;
  timestamp?: Date;
}

export interface UserSession {
  userId: string;
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  pageViews: number;
  actions: number;
  userAgent?: string;
  ipAddress?: string;
}

export class AnalyticsEventsService {
  
  /**
   * Track a user event
   */
  static async trackEvent(event: AnalyticsEvent): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO analytics_events (user_id, event_type, event_category, properties, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          event.userId,
          event.eventType,
          event.eventCategory,
          JSON.stringify(event.properties),
          event.timestamp || new Date()
        ]
      );
    } catch (error) {
      console.error('Failed to track event:', error);
    }
  }

  /**
   * Track multiple events in batch
   */
  static async trackEventsBatch(events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return;

    try {
      const values = events.map((event, index) => {
        const baseIndex = index * 5;
        return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5})`;
      }).join(', ');

      const params = events.flatMap(event => [
        event.userId,
        event.eventType,
        event.eventCategory,
        JSON.stringify(event.properties),
        event.timestamp || new Date()
      ]);

      await pool.query(
        `INSERT INTO analytics_events (user_id, event_type, event_category, properties, timestamp)
         VALUES ${values}`,
        params
      );
    } catch (error) {
      console.error('Failed to track events batch:', error);
    }
  }

  /**
   * Start a user session
   */
  static async startSession(session: Omit<UserSession, 'pageViews' | 'actions'>): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO analytics_sessions (user_id, session_id, start_time, user_agent, ip_address, page_views, actions)
         VALUES ($1, $2, $3, $4, $5, 0, 0)
         ON CONFLICT (session_id) DO UPDATE SET
           start_time = $3,
           user_agent = $4,
           ip_address = $5`,
        [
          session.userId,
          session.sessionId,
          session.startTime,
          session.userAgent,
          session.ipAddress
        ]
      );
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  }

  /**
   * Update session activity
   */
  static async updateSession(sessionId: string, pageViews?: number, actions?: number): Promise<void> {
    try {
      const updates = [];
      const params = [sessionId];
      let paramIndex = 2;

      if (pageViews !== undefined) {
        updates.push(`page_views = page_views + $${paramIndex}`);
        params.push(pageViews.toString());
        paramIndex++;
      }

      if (actions !== undefined) {
        updates.push(`actions = actions + $${paramIndex}`);
        params.push(actions.toString());
        paramIndex++;
      }

      if (updates.length > 0) {
        await pool.query(
          `UPDATE analytics_sessions SET ${updates.join(', ')}, last_activity = CURRENT_TIMESTAMP
           WHERE session_id = $1`,
          params
        );
      }
    } catch (error) {
      console.error('Failed to update session:', error);
    }
  }

  /**
   * End a user session
   */
  static async endSession(sessionId: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE analytics_sessions SET end_time = CURRENT_TIMESTAMP
         WHERE session_id = $1 AND end_time IS NULL`,
        [sessionId]
      );
    } catch (error) {
      console.error('Failed to end session:', error);
    }
  }

  /**
   * Get user events for a time period
   */
  static async getUserEvents(
    userId: string, 
    startDate: Date, 
    endDate: Date,
    eventType?: string
  ): Promise<any[]> {
    try {
      let query = `
        SELECT event_type, event_category, properties, timestamp
        FROM analytics_events
        WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3
      `;
      const params = [userId, startDate, endDate];

      if (eventType) {
        query += ` AND event_type = $4`;
        params.push(eventType);
      }

      query += ` ORDER BY timestamp DESC LIMIT 1000`;

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Failed to get user events:', error);
      return [];
    }
  }

  /**
   * Get event analytics for dashboard
   */
  static async getEventAnalytics(
    userId: string,
    days: number = 30
  ): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByCategory: Record<string, number>;
    dailyEvents: Array<{ date: string; count: number }>;
    topEvents: Array<{ eventType: string; count: number }>;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Total events
      const totalResult = await pool.query(
        `SELECT COUNT(*) as total FROM analytics_events 
         WHERE user_id = $1 AND timestamp >= $2`,
        [userId, startDate]
      );

      // Events by type
      const typeResult = await pool.query(
        `SELECT event_type, COUNT(*) as count FROM analytics_events 
         WHERE user_id = $1 AND timestamp >= $2
         GROUP BY event_type ORDER BY count DESC`,
        [userId, startDate]
      );

      // Events by category
      const categoryResult = await pool.query(
        `SELECT event_category, COUNT(*) as count FROM analytics_events 
         WHERE user_id = $1 AND timestamp >= $2
         GROUP BY event_category ORDER BY count DESC`,
        [userId, startDate]
      );

      // Daily events
      const dailyResult = await pool.query(
        `SELECT DATE(timestamp) as date, COUNT(*) as count FROM analytics_events 
         WHERE user_id = $1 AND timestamp >= $2
         GROUP BY DATE(timestamp) ORDER BY date DESC LIMIT 30`,
        [userId, startDate]
      );

      return {
        totalEvents: parseInt(totalResult.rows[0]?.total || '0'),
        eventsByType: Object.fromEntries(
          typeResult.rows.map(row => [row.event_type, parseInt(row.count)])
        ),
        eventsByCategory: Object.fromEntries(
          categoryResult.rows.map(row => [row.event_category, parseInt(row.count)])
        ),
        dailyEvents: dailyResult.rows.map(row => ({
          date: row.date,
          count: parseInt(row.count)
        })),
        topEvents: typeResult.rows.slice(0, 10).map(row => ({
          eventType: row.event_type,
          count: parseInt(row.count)
        }))
      };
    } catch (error) {
      console.error('Failed to get event analytics:', error);
      return {
        totalEvents: 0,
        eventsByType: {},
        eventsByCategory: {},
        dailyEvents: [],
        topEvents: []
      };
    }
  }

  /**
   * Get session analytics
   */
  static async getSessionAnalytics(
    userId: string,
    days: number = 30
  ): Promise<{
    totalSessions: number;
    avgSessionDuration: number;
    avgPageViews: number;
    avgActions: number;
    dailySessions: Array<{ date: string; count: number; avgDuration: number }>;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Session stats
      const statsResult = await pool.query(
        `SELECT 
           COUNT(*) as total_sessions,
           AVG(EXTRACT(EPOCH FROM (COALESCE(end_time, CURRENT_TIMESTAMP) - start_time))) as avg_duration,
           AVG(page_views) as avg_page_views,
           AVG(actions) as avg_actions
         FROM analytics_sessions 
         WHERE user_id = $1 AND start_time >= $2`,
        [userId, startDate]
      );

      // Daily sessions
      const dailyResult = await pool.query(
        `SELECT 
           DATE(start_time) as date, 
           COUNT(*) as count,
           AVG(EXTRACT(EPOCH FROM (COALESCE(end_time, CURRENT_TIMESTAMP) - start_time))) as avg_duration
         FROM analytics_sessions 
         WHERE user_id = $1 AND start_time >= $2
         GROUP BY DATE(start_time) ORDER BY date DESC LIMIT 30`,
        [userId, startDate]
      );

      const stats = statsResult.rows[0];

      return {
        totalSessions: parseInt(stats?.total_sessions || '0'),
        avgSessionDuration: parseFloat(stats?.avg_duration || '0'),
        avgPageViews: parseFloat(stats?.avg_page_views || '0'),
        avgActions: parseFloat(stats?.avg_actions || '0'),
        dailySessions: dailyResult.rows.map(row => ({
          date: row.date,
          count: parseInt(row.count),
          avgDuration: parseFloat(row.avg_duration || '0')
        }))
      };
    } catch (error) {
      console.error('Failed to get session analytics:', error);
      return {
        totalSessions: 0,
        avgSessionDuration: 0,
        avgPageViews: 0,
        avgActions: 0,
        dailySessions: []
      };
    }
  }

  /**
   * Get admin analytics (all users)
   */
  static async getAdminAnalytics(days: number = 30): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalEvents: number;
    totalSessions: number;
    topEventTypes: Array<{ eventType: string; count: number }>;
    userActivity: Array<{ userId: string; events: number; sessions: number }>;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Total and active users
      const usersResult = await pool.query(
        `SELECT 
           COUNT(DISTINCT user_id) as active_users
         FROM analytics_events 
         WHERE timestamp >= $1`,
        [startDate]
      );

      const totalUsersResult = await pool.query(
        `SELECT COUNT(DISTINCT user_id) as total_users FROM analytics_events`
      );

      // Total events and sessions
      const totalsResult = await pool.query(
        `SELECT 
           (SELECT COUNT(*) FROM analytics_events WHERE timestamp >= $1) as total_events,
           (SELECT COUNT(*) FROM analytics_sessions WHERE start_time >= $1) as total_sessions`,
        [startDate]
      );

      // Top event types
      const topEventsResult = await pool.query(
        `SELECT event_type, COUNT(*) as count FROM analytics_events 
         WHERE timestamp >= $1
         GROUP BY event_type ORDER BY count DESC LIMIT 10`,
        [startDate]
      );

      // User activity
      const userActivityResult = await pool.query(
        `SELECT 
           e.user_id,
           COUNT(e.id) as events,
           COUNT(DISTINCT s.session_id) as sessions
         FROM analytics_events e
         LEFT JOIN analytics_sessions s ON e.user_id = s.user_id AND s.start_time >= $1
         WHERE e.timestamp >= $1
         GROUP BY e.user_id
         ORDER BY events DESC LIMIT 50`,
        [startDate]
      );

      return {
        totalUsers: parseInt(totalUsersResult.rows[0]?.total_users || '0'),
        activeUsers: parseInt(usersResult.rows[0]?.active_users || '0'),
        totalEvents: parseInt(totalsResult.rows[0]?.total_events || '0'),
        totalSessions: parseInt(totalsResult.rows[0]?.total_sessions || '0'),
        topEventTypes: topEventsResult.rows.map(row => ({
          eventType: row.event_type,
          count: parseInt(row.count)
        })),
        userActivity: userActivityResult.rows.map(row => ({
          userId: row.user_id,
          events: parseInt(row.events),
          sessions: parseInt(row.sessions || '0')
        }))
      };
    } catch (error) {
      console.error('Failed to get admin analytics:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        totalEvents: 0,
        totalSessions: 0,
        topEventTypes: [],
        userActivity: []
      };
    }
  }
}
