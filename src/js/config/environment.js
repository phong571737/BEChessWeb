import dotenv from "dotenv";

dotenv.config();

export const env = {
    MONGO_URI: process.env.MONGO_URI,
    AUTHOR: process.env.AUTHOR,
    PORT: process.env.PORT,
    IP_LAN: process.env.IP_LAN,
    SERVER_NAME: process.env.SERVER_NAME
}