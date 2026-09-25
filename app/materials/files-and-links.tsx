'use client'

import { useEffect, useRef, useState } from 'react'
import { fileTypeNamed, MATERIAL_FILE_TYPES } from '~/domain/materials'
import {
  ADD_A_LINK,
  ADD_FILES,
  CANCEL_UPLOAD,
  cancelUploadOf,
  FILES_AND_LINKS,
  FILES_HINT,
  fileSize,
  LINK_HINT,
  LINK_LABEL_NAME,
  LINK_LABEL_PLACEHOLDER,
  LINK_PLACEHOLDER,
  NEEDS_SCRIPT,
  REMOVE_ITEM,
  removeItemNamed,
  UPLOAD_FAILED,
  UPLOADED,
  uploading,
} from './copy'
import { uploadField } from './form-answer'
import { ItemGlyph, itemKind, itemName, itemSize, type DrawnItem } from './items'
import { useUploadingForm } from './uploading-form'

/**
 * What the file box offers: the extensions a Material may hold, since the
 * extension is what decides a file's type. A picker that offers everything only
 * to refuse most of it afterwards is a question asked the wrong way round.
 */
const ACCEPTED = MATERIAL_FILE_TYPES.map((type) => `.${type.extension}`).join(',')

/**
 * The Files and links field on the create and edit pages (Richer materials,
 * ticket 01; M-1 of `.lavish/richer-materials/mockup.html`).
 *
 * What the Material already holds is drawn as rows with a Remove box, which
 * posts with the form like any other field and needs no script. Adding a file is
 * the one part that does: each file chosen is sent from the browser straight to
 * Storage, at an address the server mints for it, and a hidden field then names
 * it for the save. The link box is two plain fields.
 *
 * Nothing is saved until Save. A file uploaded and then abandoned stays in the
 * bucket until the tick sweeps it.
 */

/** A file the Material already holds, or a link, with the id Remove posts. */
export interface HeldItem {
  readonly id: string
  readonly item: DrawnItem
}

/**
 * A file uploaded for this form before a refusal brought it back here: its size
 * as the browser saw it, and whether the route found it gone from the bucket.
 */
export interface CarriedUpload {
  readonly path: string
  readonly filename: string
  readonly bytes: number | null
  readonly gone: boolean
}

type Upload =
  | { readonly key: string; readonly filename: string; readonly bytes: number; readonly state: 'asking' }
  | {
      readonly key: string
      readonly filename: string
      readonly bytes: number
      readonly state: 'sending'
      readonly sent: number
    }
  | {
      readonly key: string
      readonly filename: string
      readonly bytes: number | null
      readonly state: 'done'
      readonly path: string
    }
  | { readonly key: string; readonly filename: string; readonly state: 'refused'; readonly why: string }

export const FilesAndLinks = ({
  held,
  ticked,
  carried,
  linkUrl,
  linkLabel,
}: {
  readonly held: readonly HeldItem[]
  readonly ticked: readonly string[]
  readonly carried: readonly CarriedUpload[]
  readonly linkUrl: string
  readonly linkLabel: string
}) => {
  const [uploads, setUploads] = useState<readonly Upload[]>(() =>
    carried.map((upload): Upload =>
      upload.gone
        ? { key: upload.path, filename: upload.filename, state: 'refused', why: UPLOAD_FAILED }
        : {
            key: upload.path,
            filename: upload.filename,
            bytes: upload.bytes,
            state: 'done',
            path: upload.path,
          },
    ),
  )
  const [scripted, setScripted] = useState(false)
  const requests = useRef(new Map<string, XMLHttpRequest>())
  const form = useUploadingForm()

  // Server-rendered, the file box says it needs script; once this has run, it
  // does not. Nothing else about the field depends on it.
  useEffect(() => setScripted(true), [])

  // Save waits for every file still on its way.
  const inFlight = uploads.filter((upload) => upload.state === 'asking' || upload.state === 'sending').length
  const setUploading = form?.setUploading
  useEffect(() => setUploading?.(inFlight), [setUploading, inFlight])

  // What the last press said about the uploads: those refused are deleted and
  // leave the list, and those the sweep had already taken say they could not be
  // kept, on their own rows.
  const answered = form?.answered
  useEffect(() => {
    if (!answered) return
    const forget = new Set(answered.forget)
    const gone = new Set(answered.gone)
    setUploads((all) =>
      all.flatMap((upload): Upload[] => {
        if (upload.state !== 'done') return [upload]
        if (forget.has(upload.path)) return []
        return gone.has(upload.path)
          ? [{ key: upload.key, filename: upload.filename, state: 'refused', why: UPLOAD_FAILED }]
          : [upload]
      }),
    )
  }, [answered])

  const update = (key: string, next: (upload: Upload) => Upload | null) =>
    setUploads((all) =>
      all.flatMap((upload) => {
        if (upload.key !== key) return [upload]
        const changed = next(upload)
        return changed ? [changed] : []
      }),
    )

  const send = async (file: File) => {
    const key = crypto.randomUUID()
    setUploads((all) => [...all, { key, filename: file.name, bytes: file.size, state: 'asking' }])

    const response = await fetch('/materials/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, bytes: file.size }),
    }).catch(() => null)
    const answer = (await response?.json().catch(() => null)) as
      | { path: string; url: string; contentType: string }
      | { refused: string }
      | null
    if (!response?.ok || !answer || 'refused' in answer) {
      const why = answer && 'refused' in answer ? answer.refused : UPLOAD_FAILED
      update(key, () => ({ key, filename: file.name, state: 'refused', why }))
      return
    }

    // A PUT with the file as the whole body, under the type its extension names,
    // which is the type the bucket's allowed list holds.
    const request = new XMLHttpRequest()
    requests.current.set(key, request)
    request.open('PUT', answer.url)
    request.setRequestHeader('content-type', answer.contentType)
    request.setRequestHeader('x-upsert', 'false')
    request.upload.onprogress = (event) =>
      update(key, (upload) =>
        upload.state === 'asking' || upload.state === 'sending'
          ? { key, filename: file.name, bytes: file.size, state: 'sending', sent: event.loaded }
          : upload,
      )
    request.onload = () => {
      requests.current.delete(key)
      update(key, () =>
        request.status >= 200 && request.status < 300
          ? { key, filename: file.name, bytes: file.size, state: 'done', path: answer.path }
          : { key, filename: file.name, state: 'refused', why: UPLOAD_FAILED },
      )
    }
    request.onerror = () => {
      requests.current.delete(key)
      update(key, () => ({ key, filename: file.name, state: 'refused', why: UPLOAD_FAILED }))
    }
    update(key, () => ({ key, filename: file.name, bytes: file.size, state: 'sending', sent: 0 }))
    request.send(file)
  }

  const cancel = (key: string) => {
    requests.current.get(key)?.abort()
    requests.current.delete(key)
    update(key, () => null)
  }

  return (
    <div className="field">
      <span className="label">{FILES_AND_LINKS}</span>

      {held.length > 0 || uploads.length > 0 ? (
        <div className="items">
          {held.map(({ id, item }) => (
            <div key={id} className="item-row">
              <span className="ic">
                <ItemGlyph item={item} />
              </span>
              <span className="nm">
                {itemName(item)}
                <span className="sub">{itemKind(item)}</span>
              </span>
              <span className="muted">{itemSize(item)}</span>
              <label className="check">
                <input
                  type="checkbox"
                  name="removeItem"
                  value={id}
                  defaultChecked={ticked.includes(id)}
                  aria-label={removeItemNamed(itemName(item))}
                />{' '}
                <span>{REMOVE_ITEM}</span>
              </label>
            </div>
          ))}

          {uploads.map((upload) => (
            <div key={upload.key} className={`item-row${upload.state === 'done' ? '' : ' up'}`}>
              <span className="ic">
                <ItemGlyph
                  item={{
                    kind: 'file',
                    filename: upload.filename,
                    contentType: fileTypeNamed(upload.filename)?.contentType ?? '',
                    bytes: 0,
                  }}
                />
              </span>
              <span className="nm">
                {upload.filename}
                {upload.state === 'refused' ? (
                  <span className="sub refused" role="alert">
                    {upload.why}
                  </span>
                ) : upload.state === 'done' ? (
                  <span className="sub">{UPLOADED}</span>
                ) : (
                  <>
                    <span className="sub">
                      {uploading(upload.state === 'sending' ? upload.sent : 0, upload.bytes)}
                    </span>
                    <span className="bar" aria-hidden="true">
                      <i
                        style={{
                          width: `${Math.round(((upload.state === 'sending' ? upload.sent : 0) / Math.max(upload.bytes, 1)) * 100)}%`,
                        }}
                      />
                    </span>
                  </>
                )}
              </span>
              <span className="muted">
                {upload.state !== 'refused' && upload.bytes !== null ? fileSize(upload.bytes) : ''}
              </span>
              {upload.state === 'done' ? (
                <>
                  <input type="hidden" name="upload" value={uploadField(upload)} />
                  <button
                    type="button"
                    className="small sec"
                    aria-label={removeItemNamed(upload.filename)}
                    onClick={() => cancel(upload.key)}
                  >
                    {REMOVE_ITEM}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="small sec"
                  aria-label={
                    upload.state === 'refused'
                      ? removeItemNamed(upload.filename)
                      : cancelUploadOf(upload.filename)
                  }
                  onClick={() => cancel(upload.key)}
                >
                  {upload.state === 'refused' ? REMOVE_ITEM : CANCEL_UPLOAD}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div className="adders">
        <div className="adder">
          <label className="label" htmlFor="m-files">
            {ADD_FILES}
          </label>
          {/* No name: the bytes never go with the form. Each file is sent to
              Storage as it is chosen, and the box is emptied for the next. */}
          <input
            id="m-files"
            type="file"
            multiple
            accept={ACCEPTED}
            disabled={!scripted}
            onChange={(event) => {
              const chosen = [...(event.currentTarget.files ?? [])]
              event.currentTarget.value = ''
              for (const file of chosen) void send(file)
            }}
          />
          <p className="subtle">{scripted ? FILES_HINT : NEEDS_SCRIPT}</p>
        </div>
        <div className="adder">
          <label className="label" htmlFor="m-link">
            {ADD_A_LINK}
          </label>
          <input
            id="m-link"
            name="linkUrl"
            type="url"
            inputMode="url"
            placeholder={LINK_PLACEHOLDER}
            defaultValue={linkUrl}
          />
          <input
            name="linkLabel"
            type="text"
            placeholder={LINK_LABEL_PLACEHOLDER}
            aria-label={LINK_LABEL_NAME}
            defaultValue={linkLabel}
          />
          <p className="subtle">{LINK_HINT}</p>
        </div>
      </div>
    </div>
  )
}
