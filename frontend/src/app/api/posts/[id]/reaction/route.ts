import { NextResponse } from "next/server";
import { removeReaction, setReaction } from "../../../../../lib/mockFeed";
import type { ReactionType } from "../../../../../types/feed";

const reactionTypes: ReactionType[] = ["support", "fire", "congrats", "laugh"];

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const reactionType =
    typeof body === "object" &&
    body !== null &&
    "reaction_type" in body &&
    typeof body.reaction_type === "string"
      ? body.reaction_type
      : null;

  if (!reactionType || !reactionTypes.includes(reactionType as ReactionType)) {
    return NextResponse.json(
      { message: "reaction_type must be support, fire, congrats, or laugh." },
      { status: 400 },
    );
  }

  const post = setReaction(id, reactionType as ReactionType);
  if (!post) return NextResponse.json({ message: "Post not found." }, { status: 404 });
  return NextResponse.json({ item: post });
}

export async function DELETE(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const post = removeReaction(id);
  if (!post) return NextResponse.json({ message: "Post not found." }, { status: 404 });
  return NextResponse.json({ item: post });
}
