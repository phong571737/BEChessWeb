export const IDUtils = {
    // encode id
    encode(id) {
        return btoa(id).replace(/=/g, '');
    },

    // decode from id encoded
    decode(hash) {
        const padded = hash + '=='.slice(0, (4 - hash.length % 4) % 4);
        return atob(padded);
    }
}