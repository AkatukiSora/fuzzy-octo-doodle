import styles from "./FriendProfile.module.css";

export interface FriendProfileProps {
  name: string;
  avatarUrl?: string;
}

export function FriendProfile({ name, avatarUrl }: FriendProfileProps) {
  return (
    <section className={styles["profile"]} aria-label="フレンドプロフィール">
      <div className={styles["avatar"]}>
        {avatarUrl ? (
          <img className={styles["avatarImage"]} src={avatarUrl} alt={`${name}のプロフィール写真`} />
        ) : (
          <span aria-hidden="true">{name.charAt(0)}</span>
        )}
      </div>
      <h2 className={styles["name"]}>{name}</h2>
    </section>
  );
}
