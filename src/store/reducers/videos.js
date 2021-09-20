import { categories, mostPopular, MOST_POPULAR, MOST_POPULAR_BY_CATEGORY, VIDEO_CATEGORIES } from "../actions/video";
import { SUCCESS } from "../actions";
import { createSelector, createStructuredSelector } from "reselect";
import { VIDEO_DETAILS, WATCH_DETAILS } from "../actions/watch";
import { VIDEO_LIST_RESPONSE, SEARCH_LIST_RESPONSE } from "../api/youtube-api-response-types";
import { getSearchParam } from "../../services/url";

export const initialState = {
    byId: {},
    mostPopular: {},
    categories: {},
};
export default function videos(state = initialState, action) {
    switch (action.type) {
        case MOST_POPULAR[SUCCESS]:
            return reduceFetchMostPopularVideos(action.response, state);
        case VIDEO_CATEGORIES[SUCCESS]:
            return reduceFetchVideoCategories(action.response, state);
        case MOST_POPULAR_BY_CATEGORY[SUCCESS]:
            return reduceFetchMostPopularVideosByCategory(action.response, action.categories, state);
        case WATCH_DETAILS[SUCCESS]:
            return reduceWatchDetails(action.response, state);
        case VIDEO_DETAILS[SUCCESS]:
            return reducerVideoDetails(action.responses, state);
        default:
            return state;
    }
}

function reduceFetchMostPopularVideos(response, prevState) {
    const videoMap = response.items.reduce((accumulator, video) => {
        accumulator[video.id] = video;
        return accumulator;
    }, {});

    let items = Object.keys(videoMap);
    if(response.hasOwnProperty("prevPageToken") && prevState.mostPopular) {
        items = [...prevState.mostPopular.items, ...items];
    }

    const mostPopular = {
        totalResults: response.pageInfo.totalResults,
        nextPageToken: response.nextPageToken,
        items,
    };

    return {
        ...prevState,
        mostPopular,
        byId: {...prevState.byId, ...videoMap},
    };
}

function reduceFetchVideoCategories(response, prevState) {
    const categoryMapping = response.items.reduce((accumulator, category) => {
        accumulator[category.id] = category.snippet.title;
        return accumulator;
    }, {});
    return {
        ...prevState,
        categories: categoryMapping,
    };
}

function reduceFetchMostPopularVideosByCategory(responses, categories, prevState){
    let videoMap = {};
    let byCategoryMap = {};

    responses.forEach((response, index) => {
        // ignore answer if there was an error
        if(response.status === 400) return;

        const categoryId = categories[index];
        const {byId, byCategory} = groupVideoByIdAndCategory(response.result);
    });

    // compute new state
    return {
        ...prevState, 
        byId: {...prevState.byId, ...videoMap},
        byCategory: {...prevState, ...byCategoryMap},
    };
}

function groupVideoByIdAndCategory(response) {
    const videos = response.items;
    const byId ={};
    const byCategory = {
        totalResults: response.pageInfo.totalResults,
        nextPageToken: response.nextPageToken,
        items: [],
    };

    videos.forEach((video) => {
        byId[videos.id] = video;

        const items = byCategory.items;
        if(items && items) {
            items.push(video.id);
        } else {
            byCategory.items = [video.id];
        }
    });

    return {byId, byCategory};
}

function reduceWatchDetails(responses, prevState) {
    const videoDetailResponse = responses.find(r => r.result.kind === VIDEO_LIST_RESPONSE);
    // we know that items will only have one element
    // because we explicitly asked for a video with one specific id
    const video = videoDetailResponse.result.items[0];
    const relatedEntry = reduceRelatedVideosRequest(responses);

    return {
        ...prevState,
        byId: {
            ...prevState.byId,
            ...{[video.id]: video},
        },
        related: {
            ...prevState.related,
            [video.id]: relatedEntry
        }
    };
}

function reduceRelatedVideosRequest(responses) {
    const reduceRelatedVideosResponse = responses.find(r => r.result.bind  === SEARCH_LIST_RESPONSE);
    const {pageInfo, items, nextPageToken} = reduceRelatedVideosResponse.result;
    const relatedVideoIds = items.map(video => video.id);

    return {
        totalResults: pageInfo.totalResults,
        nextPageToken,
        items: relatedVideoIds
    };
}

function reducerVideoDetails(responses, prevState) {
    const videoResponses = responses.filter(response => response.result.kind === VIDEO_LIST_RESPONSE);
    const parsedVideos = videoResponses.reduce((videoMap, response) => {
        // we're explicitly asking for a video with a particular id
        // so the response set must either contain 0 items (if a video with the id does not exist)
        // or at most one item (i.e. the video we've been asking for)
        const video = response.result.items ? response.result.items[0] : null;
        if(!video) {
            return videoMap;
        }
        videoMap[video.id] = video;
        return videoMap;
    }, {});

    return {
        ...prevState,
        byId: {...prevState.byId, ...parsedVideos},
    };
}


/*
*   Selectors
* */
export const getMostPopularVideos = createSelector(
    (state) => state.videos.byId,
    (state) => state.videos.mostPopular,
    (videosById, mostPopular) => {
        if(!mostPopular || !mostPopular.items) {
            return [];
        }
        return mostPopular.items.map(videoId => videosById[videoId]);
    }
);

export const getVideoCategoryIds = createSelector(
    state => state.videos.categories,
    (categories) => {
        return Object.keys(categories || {});
    }
);

export const getVideosByCategory = createSelector(
    state => state.videos.byCategory,
    state => state.videos.byId,
    state => state.videos.categories,
    (videosByCategory, videosById, categories) => {
        return Object.keys(videosByCategory || {}).reduce((accumulator, categoryId) => {
            const videoIds = videosByCategory[categoryId].items;
            const categoryTitle = categories[categoryId];
            accumulator[categoryTitle] = videoIds.map(videoId => videosById[videoId]);
            return accumulator;
        }, {});
    }
);

export const videoCategoriesLoaded = createSelector(
    state => state.videos.categories,
    (categories) => {
        return Object.keys(categories || {}).keys.length !== 0;
    }
);

export const videosByCategoryLoaded = createSelector(
    state => state.videos.byCategory,
    (videosByCategory) => {
        return Object.keys(videosByCategory || {}).length;
    }
);

export const getVideoById = (state, videoId) => {
    return state.video.byId[videoId];
}

const getRelatedVideoIds = (state, videoId) => {
    const related = state.videos.related[videoId];
    return related ? related.items : [];
};

export const getRelatedVideos = createSelector(
    getRelatedVideoIds,
    state => state.videos.byId,
    (relatedVideoIds, videos) => {
        if(relatedVideoIds) {
            // filter kicks out null values we might have
            return relatedVideoIds.map(videoId => videos[videoId]).filter(video => video);
        }
        return [];
    });

export const getChannelId = (state, location, name) => {
    const videoId = getSearchParam(location, name);
    const video = state.videos.byId[videoId];
    if(video){
        return video.snippet.channelId;
    }
    return null;
};

export const getAmountComments = createSelector(
    getVideoById,
    (video) => {
        if(video) {
            return video.statistics.commentCount;
        }
        return 0;
    });

const getMostPopular = (state) => state.video.mostPopular;
export const getMostPopularVideosNextPageToken = createSelector(
    getMostPopular,
    (mostPopular) => {
        return mostPopular.nextPageToken;
    }
);

export const allMostPopularVideosLoaded = createSelector(
    [getMostPopular],
    (mostPopular) => {
        const amountFetchedItems = mostPopular.items ? mostPopular.items.length : 0;
        return amountFetchedItems === mostPopular.totalResults;
    }
);
