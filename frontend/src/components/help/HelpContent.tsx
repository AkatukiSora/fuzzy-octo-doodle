import Link from "next/link";
import { helpCategories } from "../../lib/helpContent";
import { Card } from "../ui/Card";
import styles from "./Help.module.css";

export function HelpContent() {
  return <>
    <Card variant="tinted"><div className={styles["intro"]}>
      <span className={styles["icon"]} aria-hidden="true">?</span>
      <div><h2 className={styles["heading"]}>お困りのことはありますか？</h2><p className={styles["description"]}>よくある質問から、使い方や現在利用できる機能をご確認ください。</p></div>
    </div></Card>
    <h2 className={styles["heading"]}>よくある質問</h2>
    <nav className={styles["categories"]} aria-label="FAQのカテゴリ">{helpCategories.map(category => <a key={category.id} className={styles["chip"]} href={`#help-${category.id}`}>{category.label}</a>)}</nav>
    {helpCategories.map(category => <section key={category.id} id={`help-${category.id}`} className={styles["category"]} aria-labelledby={`help-${category.id}-title`}>
      <h2 id={`help-${category.id}-title`}>{category.label}</h2>
      <Card variant="outlined">{category.items.map(item => <details key={item.question} className={styles["faq"]}>
        <summary>{item.question}</summary>
        <div className={styles["answer"]}><p>{item.answer}</p>{"href" in item && <Link href={item.href}>{item.linkLabel} ›</Link>}</div>
      </details>)}</Card>
    </section>)}
    <Card variant="tinted" className={styles["stack"]}>
      <div><h2 className={styles["heading"]}>解決しませんでしたか？</h2><p className={styles["description"]}>お問い合わせ内容の入力・確認ができます。送信機能は準備中です。</p></div>
      <Link className={styles["link"]} href="/mypage/help/contact">お問い合わせ</Link>
    </Card>
  </>;
}
