import { GeoFirestoreTypes } from './GeoFirestoreTypes';
import { GeoFirestore } from './GeoFirestore';
import { GeoQuerySnapshot } from './GeoQuerySnapshot';
/**
 * A `GeoQuery` refers to a Query which you can read or listen to. You can also construct refined `GeoQuery` objects by adding filters and
 * ordering.
 */
export declare class GeoQuery {
    private _query;
    private _center;
    private _limit;
    private _radius;
    private _isWeb;
    /**
     * @param _query The `Query` instance.
     * @param queryCriteria The query criteria of geo based queries, includes field such as center, radius, and limit.
     */
    constructor(_query: GeoFirestoreTypes.cloud.Query | GeoFirestoreTypes.web.Query, queryCriteria?: GeoFirestoreTypes.QueryCriteria);
    /** The native `Query` instance. */
    readonly native: GeoFirestoreTypes.cloud.Query | GeoFirestoreTypes.web.Query;
    /**
     * The `Firestore` for the Firestore database (useful for performing transactions, etc.).
     */
    readonly firestore: GeoFirestore;
    /**
     * Attaches a listener for `GeoQuerySnapshot` events.
     *
     * @param onNext A callback to be called every time a new `GeoQuerySnapshot` is available.
     * @param onError A callback to be called if the listen fails or is cancelled. Since multuple queries occur only the failed query will
     * cease.
     * @return An unsubscribe function that can be called to cancel the snapshot listener.
     */
    readonly onSnapshot: ((onNext: (snapshot: GeoQuerySnapshot) => void, onError?: (error: Error) => void) => () => void);
    /**
     * Executes the query and returns the results as a GeoQuerySnapshot.
     *
     * WEB CLIENT ONLY
     * Note: By default, get() attempts to provide up-to-date data when possible by waiting for data from the server, but it may return
     * cached data or fail if you are offline and the server cannot be reached. This behavior can be altered via the `GetOptions` parameter.
     *
     * @param options An object to configure the get behavior.
     * @return A Promise that will be resolved with the results of the GeoQuery.
     */
    get(options?: GeoFirestoreTypes.web.GetOptions): Promise<GeoQuerySnapshot>;
    getWithCustomQueries(customiseQueries: (q: [string, GeoFirestoreTypes.web.Query][]) => [string, GeoFirestoreTypes.web.Query][], options?: GeoFirestoreTypes.web.GetOptions): Promise<[string, GeoQuerySnapshot][]>;
    /**
     * Creates and returns a new GeoQuery that's additionally limited to only return up to the specified number of documents.
     *
     * This function returns a new (immutable) instance of the GeoQuery (rather than modify the existing instance) to impose the limit.
     *
     * Note: Limits on geoqueries are applied based on the distance from the center. Geoqueries require an aggregation of queries.
     * When performing a geoquery the library applies the limit on the client. This may mean you are loading to the client more documents
     * then you intended. Use with this performance limitation in mind.
     *
     * @param limit The maximum number of items to return.
     * @return The created GeoQuery.
     */
    limit(limit: number): GeoQuery;
    /**
     * Creates and returns a new GeoQuery with the geoquery filter where `get` and `onSnapshot` will query around.
     *
     * This function returns a new (immutable) instance of the GeoQuery (rather than modify the existing instance) to impose the filter.
     *
     * @param newQueryCriteria The criteria which specifies the query's center and radius.
     * @return The created GeoQuery.
     */
    near(newGeoQueryCriteria: GeoFirestoreTypes.QueryCriteria): GeoQuery;
    /**
     * Creates and returns a new GeoQuery with the additional filter that documents must contain the specified field and that its value
     * should satisfy the relation constraint provided.
     *
     * This function returns a new (immutable) instance of the GeoQuery (rather than modify the existing instance) to impose the filter.
     *
     * @param fieldPath The path to compare
     * @param opStr The operation string (e.g "<", "<=", "==", ">", ">=").
     * @param value The value for comparison
     * @return The created GeoQuery.
     */
    where(fieldPath: string | GeoFirestoreTypes.cloud.FieldPath | GeoFirestoreTypes.web.FieldPath, opStr: GeoFirestoreTypes.WhereFilterOp, value: any): GeoQuery;
    /**
     * Creates an array of geohash strings and `Query` objects that query the appropriate geohashes
     * based on the radius and center GeoPoint of the query criteria.
     *
     * @return Array of [geohash, Queries] to search against.
     */
    private _generateQueryWithGeohashes;
    /**
     * Creates an array of `Query` objects that query the appropriate geohashes based on the radius and center GeoPoint of the query criteria.
     *
     * @return Array of Queries to search against.
     */
    private _generateQuery;
    /**
     * Returns the center and radius of geo based queries as a QueryCriteria object.
     */
    private readonly _queryCriteria;
    /**
     * Decodes a query string to a query
     *
     * @param str The encoded query.
     * @return The decoded query as a [start, end] pair.
     */
    private _stringToQuery;
    /**
     * Encodes a query as a string for easier indexing and equality.
     *
     * @param query The query to encode.
     * @return The encoded query as string.
     */
    private _queryToString;
}
