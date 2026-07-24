import { Collection, Document, Filter } from "mongodb";
import { getDB } from "../config/database.js";
import bcrypt from "bcrypt";

const users = (): Collection<UserDoc> => getDB().collection<UserDoc>("users");

export interface UserDoc extends Document {
    _id?: string;
    username: string;
    email: string;
    password: string;
    role?: "admin" | "user";
    createdAt?: Date;
}

export async function createUser(username: string, email: string, password: string): Promise<UserDoc | null> {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await users().insertOne({
        username,
        email,
        password: hashedPassword,
        role: "user",
        createdAt: new Date(),
    });
    
    const createdUser: UserDoc = {
        _id: result.insertedId.toString(),
        username,
        email,
        password: hashedPassword,
        role: "user",
        createdAt: new Date(),
    };
    return createdUser;
}

export async function ensureDefaultAdmin(username: string, email: string, password: string): Promise<void> {
    const existingUser = await findUserByEmail(email);

    if (existingUser) {
        if (existingUser.role !== "admin") {
            await users().updateOne(
                { email } as Filter<UserDoc>,
                { $set: { role: "admin" } }
            );
        }
        return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await users().insertOne({
        username,
        email,
        password: hashedPassword,
        role: "admin",
        createdAt: new Date(),
    });
}

export async function findUserByEmail(email: string): Promise<UserDoc | null> {
    return users().findOne({ email } as Filter<UserDoc>);
}

export async function findUserByUsername(username: string): Promise<UserDoc | null> {
    return users().findOne({ username } as Filter<UserDoc>);
}

export async function validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
}