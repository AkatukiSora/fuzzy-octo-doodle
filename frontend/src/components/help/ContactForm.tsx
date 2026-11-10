"use client";

import { useRef, useState } from "react";
import type { ContactDraft, ContactErrors } from "../../lib/contact";
import { validateContact } from "../../lib/contact";
import { contactCategories } from "../../lib/helpContent";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Textarea } from "../ui/Textarea";
import { InquiryImagePicker } from "../ui/InquiryImagePicker";
import styles from "./Help.module.css";

export function ContactForm() {
  const [draft, setDraft] = useState<ContactDraft>({ category: "", subject: "", detail: "", images: [] });
  const [checking, setChecking] = useState(false);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [touched, setTouched] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  function change(next: ContactDraft) {
    setDraft(next);
    if (touched) setErrors(validateContact(next));
  }
  function edit() {
    setChecking(false);
    requestAnimationFrame(() => { formRef.current?.querySelector<HTMLSelectElement>("select")?.focus(); });
  }

  return <>
    <ol className={styles["step"]} aria-label="お問い合わせの手順"><li aria-current={checking ? undefined : "step"}>1 入力</li><li aria-current={checking ? "step" : undefined}>2 内容確認</li></ol>
    <div className={styles["notice"]} id="contact-notice" role="status"><strong>お問い合わせの送信は準備中です</strong><p>入力内容の確認までご利用いただけます。内容や画像は保存・送信されません。画面を離れると入力内容は失われます。</p></div>
    <Card variant="outlined">
      <form ref={formRef} hidden={checking} noValidate className={styles["form"]} aria-describedby="contact-notice" onSubmit={event => {
        event.preventDefault();
        const nextErrors = validateContact(draft);
        setErrors(nextErrors);
        setTouched(true);
        if (Object.keys(nextErrors).length > 0) {
          requestAnimationFrame(() => { formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); });
          return;
        }
        setChecking(true);
        requestAnimationFrame(() => { headingRef.current?.focus(); });
      }}>
        <Select label="お問い合わせカテゴリ" id="contact-category" required options={contactCategories} value={draft.category} error={errors.category ?? ""} onChange={event => { change({ ...draft, category: event.target.value }); }} />
        <Input label="件名" id="contact-subject" required fullWidth value={draft.subject} error={errors.subject ?? ""} placeholder="例：証拠写真の提出について" onChange={event => { change({ ...draft, subject: event.target.value }); }} />
        <Textarea label="お問い合わせ内容" id="contact-detail" required rows={7} value={draft.detail} error={errors.detail ?? ""} helperText="状況や操作手順、発生した日時などを入力してください（1〜1000文字）。" onChange={event => { change({ ...draft, detail: event.target.value }); }} />
        <p className={styles["count"]} aria-live="polite">{draft.detail.length} / 1000文字</p>
        <InquiryImagePicker id="contact-images" files={draft.images} onChange={images => { change({ ...draft, images }); }} />
        {errors.images && <p className={styles["error"]} role="alert">{errors.images}</p>}
        <Button type="submit" fullWidth>入力内容を確認する</Button>
        <Button disabled fullWidth aria-describedby="contact-notice">送信する（準備中）</Button>
      </form>
      {checking && <section className={styles["stack"]} aria-labelledby="contact-review-title">
        <h2 id="contact-review-title" className={styles["reviewTitle"]} ref={headingRef} tabIndex={-1}>お問い合わせ内容の確認</h2>
        <p className={styles["description"]}>以下は入力内容の確認です。まだ送信されていません。</p>
        <dl className={styles["facts"]}>
          <dt>カテゴリ</dt><dd>{contactCategories.find(category => category.value === draft.category)?.label}</dd>
          <dt>件名</dt><dd>{draft.subject}</dd>
          <dt>お問い合わせ内容</dt><dd>{draft.detail}</dd>
        </dl>
        <InquiryImagePicker id="contact-review-images" files={draft.images} onChange={images => { change({ ...draft, images }); }} readOnly />
        <Button variant="secondary" fullWidth onClick={edit}>入力内容を修正する</Button>
        <Button disabled fullWidth aria-describedby="contact-notice">送信する（準備中）</Button>
      </section>}
    </Card>
  </>;
}
