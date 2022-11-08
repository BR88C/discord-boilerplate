"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Metrics = void 0;
const node_utils_1 = require("@br88c/node-utils");
const influxdb_client_1 = require("@influxdata/influxdb-client");
const distype_1 = require("distype");
/**
 * The metrics controller.
 * Reports metrics to InfluxDB.
 */
class Metrics {
    /**
     * The client the metrics controller is bound to.
     */
    client;
    /**
     * The InfluxDB client.
     */
    influxClient;
    /**
     * {@link MetricsOptions Options} for the metrics controller..
     */
    options;
    /**
     * The system string used for logging.
     */
    system = `Metrics`;
    /**
     * The callback to use to fetch extra points when reporting metrics to InfluxDB.
     */
    _influxDBCallback = null;
    /**
     * The last recorded CPU metrics.
     */
    _lastCPUMetrics = {
        usage: process.cpuUsage(),
        time: Date.now()
    };
    /**
     * Create the metrics controller.
     * @param client The client to bind to.
     */
    constructor(client, options) {
        this.options = {
            influxDB: options.influxDB ? {
                application: options.influxDB.application,
                bucket: options.influxDB.bucket,
                extraTags: options.influxDB.extraTags ?? {},
                org: options.influxDB.org,
                reportInterval: options.influxDB.reportInterval ?? 0,
                token: options.influxDB.token,
                url: options.influxDB.url
            } : undefined,
            topgg: options.topgg ? {
                reportInterval: options.topgg.reportInterval ?? 0,
                postShards: options.topgg.postShards ?? false,
                token: options.topgg.token ?? process.env.TOPGG_TOKEN
            } : undefined
        };
        this.client = client;
        if (this.options.influxDB) {
            this.influxClient = new influxdb_client_1.InfluxDB({
                token: this.options.influxDB.token,
                url: this.options.influxDB.url
            });
            if (this.options.influxDB.reportInterval) {
                setInterval(() => {
                    this.reportInfluxDBMetrics().catch((error) => {
                        console.error(`\n${node_utils_1.LoggerRawFormats.RED}${error.stack}${node_utils_1.LoggerRawFormats.RESET}\n`);
                    });
                }, this.options.influxDB.reportInterval).unref();
            }
        }
        if (this.options.topgg) {
            if (!this.options.topgg.token)
                throw new Error(`Top.gg API token is undefined`);
            if (this.options.topgg.reportInterval) {
                setInterval(() => {
                    this.reportTopggMetrics().catch((error) => {
                        console.error(`\n${node_utils_1.LoggerRawFormats.RED}${error.stack}${node_utils_1.LoggerRawFormats.RESET}\n`);
                    });
                }, this.options.topgg.reportInterval).unref();
            }
        }
        this.client.logger.log(`Initialized metrics controller`, {
            level: `DEBUG`, system: this.system
        });
    }
    /**
     * Reports metrics to InfluxDB.
     */
    async reportInfluxDBMetrics() {
        if (!this.options.influxDB || !this.influxClient)
            throw new Error(`Cannot post to InfluxDB; options not defined`);
        const usage = process.cpuUsage();
        const time = Date.now();
        const cpu = 100 * ((usage.system - this._lastCPUMetrics.usage.system) + (usage.user - this._lastCPUMetrics.usage.user)) / ((time - this._lastCPUMetrics.time) * 1000);
        this._lastCPUMetrics = {
            usage,
            time
        };
        const stats = {
            cpu,
            memory: process.memoryUsage.rss(),
            shardCount: this.client.gateway.shards.size,
            shardGuilds: this.client.gateway.guildCount,
            shardPing: await this.client.gateway.getAveragePing(),
            shards: await Promise.all(this.client.gateway.shards.map(async (shard) => ({
                id: shard.id,
                guilds: shard.guilds.size,
                ping: shard.state >= distype_1.GatewayShardState.READY ? await shard.getPing() : 0,
                state: distype_1.GatewayShardState[shard.state]
            })))
        };
        const writeAPI = this.influxClient.getWriteApi(this.options.influxDB.org, this.options.influxDB.bucket);
        writeAPI.useDefaultTags({
            application: this.options.influxDB.application,
            ...this.options.influxDB.extraTags
        });
        const processPoint = new influxdb_client_1.Point(`process`)
            .floatField(`cpu`, stats.cpu)
            .intField(`memory`, stats.memory)
            .intField(`shards`, stats.shardCount)
            .intField(`guilds`, stats.shardGuilds)
            .floatField(`ping`, stats.shardPing);
        const shardPoints = [];
        stats.shards.forEach((shard) => {
            shardPoints.push(new influxdb_client_1.Point(`shard`)
                .tag(`id`, `${shard.id}`)
                .intField(`guilds`, shard.guilds)
                .intField(`ping`, shard.ping)
                .stringField(`state`, shard.state));
        });
        const extraPoints = (await this._influxDBCallback?.()) ?? [];
        const points = [processPoint, ...shardPoints, ...extraPoints];
        writeAPI.writePoints(points);
        await writeAPI.close();
        this.client.logger.log(`Wrote ${points.length} points to InfluxDB`, {
            level: `DEBUG`, system: this.system
        });
    }
    /**
     * Reports metrics to Top.gg.
     */
    async reportTopggMetrics() {
        if (!this.options.topgg)
            throw new Error(`Cannot post to Top.gg; options not defined`);
        if (!this.client.gateway.user?.id)
            throw new Error(`Cannot post to Top.gg: application ID is undefined (client.gateway.user.id)`);
        await this.client.topggRequest(`POST`, `/bots/${this.client.gateway.user.id}/stats`, { body: {
                server_count: this.client.gateway.guildCount,
                shard_count: this.options.topgg.postShards ? this.client.gateway.shards.size : undefined
            } }, this.options.topgg.token);
        this.client.logger.log(`Posted metrics to Top.gg`, {
            level: `DEBUG`, system: this.system
        });
    }
    /**
     * Set a callback to be used to fetch extra points when reporting metrics to InfluxDB.
     */
    setInfluxDBCallback(callback) {
        this._influxDBCallback = callback;
    }
}
exports.Metrics = Metrics;
