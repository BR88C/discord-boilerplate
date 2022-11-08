import { ClientManager } from './ClientManager';
import { InfluxDB, Point } from '@influxdata/influxdb-client';
/**
 * {@link Metrics} options.
 */
export interface MetricsOptions {
    /**
     * InfluxDB metrics reporting options.
     */
    influxDB?: {
        /**
         * The application's name.
         */
        application: string;
        /**
         * The InfluxDB bucket to use.
         */
        bucket: string;
        /**
         * Extra default tags to use.
         */
        extraTags?: Record<string, any>;
        /**
         * The InfluxDB organization to use.
         */
        org: string;
        /**
         * The interval to automatically report metrics to InfluxDB at in milliseconds.
         * A value of `0` will not report any metrics automatically.
         * @default 0
         */
        reportInterval?: number;
        /**
         * The token to access InfluxDB.
         */
        token: string;
        /**
         * The URL to connect to.
         */
        url: string;
    };
    /**
     * Top.gg metrics reporting options.
     */
    topgg?: {
        /**
         * The interval to automatically report metrics to Top.gg at in milliseconds.
         * A value of `0` will not report any metrics automatically.
         * @default 0
         */
        reportInterval?: number;
        /**
         * If the shard count should be posted.
         * @default false
         */
        postShards?: boolean;
        /**
         * Your Top.gg API token.
         * Alternatively, if `process.env.TOPGG_TOKEN` is defined, it will be used.
         */
        token?: string;
    };
}
/**
 * The metrics controller.
 * Reports metrics to InfluxDB.
 */
export declare class Metrics {
    /**
     * The client the metrics controller is bound to.
     */
    client: ClientManager;
    /**
     * The InfluxDB client.
     */
    influxClient?: InfluxDB;
    /**
     * {@link MetricsOptions Options} for the metrics controller..
     */
    readonly options: {
        influxDB: Required<MetricsOptions[`influxDB`]>;
        topgg: Required<MetricsOptions[`topgg`]>;
    };
    /**
     * The system string used for logging.
     */
    readonly system = "Metrics";
    /**
     * The callback to use to fetch extra points when reporting metrics to InfluxDB.
     */
    private _influxDBCallback;
    /**
     * The last recorded CPU metrics.
     */
    private _lastCPUMetrics;
    /**
     * Create the metrics controller.
     * @param client The client to bind to.
     */
    constructor(client: ClientManager, options: MetricsOptions);
    /**
     * Reports metrics to InfluxDB.
     */
    reportInfluxDBMetrics(): Promise<void>;
    /**
     * Reports metrics to Top.gg.
     */
    reportTopggMetrics(): Promise<void>;
    /**
     * Set a callback to be used to fetch extra points when reporting metrics to InfluxDB.
     */
    setInfluxDBCallback(callback: () => Point[] | Promise<Point[]>): void;
}
