import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

export async function sendOrderConfirmationEmail(
  to: string,
  orderNumber: string,
  officeId: string
) {
  if (!resend) {
    console.log(
      '[email] RESEND_API_KEY not set, skipping order confirmation email for:',
      orderNumber
    )
    return
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@example.com'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const completeUrl = `${siteUrl}/apply/complete?order_number=${orderNumber}&office_id=${officeId}`

  const { error } = await resend.emails.send({
    from: fromEmail,
    to,
    subject: `【買取申込完了】ご注文番号: ${orderNumber}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>買取申込を受け付けました</h2>
        <p>この度はお申込みいただきありがとうございます。</p>

        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0 0 4px; color: #666; font-size: 14px;">ご注文番号</p>
          <p style="margin: 0; font-size: 24px; font-weight: bold; font-family: monospace;">${orderNumber}</p>
        </div>

        <div style="background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 8px; font-size: 16px; font-weight: bold; color: #856404;">
            ⚠️ 商品を発送したら追跡番号を登録してください
          </p>
          <p style="margin: 0 0 16px; font-size: 14px; color: #856404;">
            下のボタンから追跡番号を入力できます。<br>
            <strong>このメールを保存しておくと、いつでも追跡番号を登録できます。</strong>
          </p>
          <div style="text-align: center;">
            <a href="${completeUrl}" style="display: inline-block; background: #f59e0b; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: bold;">
              📦 追跡番号を入力する
            </a>
          </div>
        </div>

        <p style="font-size: 14px; color: #666;">
          追跡番号の登録後、検品を行い、結果をメールにてお知らせいたします。
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">

        <p style="font-size: 12px; color: #999;">
          このメールは買取申込の確認のため自動送信されています。<br>
          お心当たりのない場合は、このメールを破棄してください。
        </p>
      </div>
    `,
  })

  if (error) {
    console.error('[email] Failed to send order confirmation email:', error)
  }
}

export async function sendPaymentCompletionEmail(
  to: string,
  orderNumber: string,
  amount: number,
  pdfBuffer?: Buffer
) {
  if (!resend) {
    console.log(
      '[email] RESEND_API_KEY not set, skipping payment completion email for:',
      orderNumber
    )
    return
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@example.com'

  const attachments = pdfBuffer
    ? [{ filename: `査定結果_${orderNumber}.pdf`, content: pdfBuffer }]
    : undefined

  const { error } = await resend.emails.send({
    from: fromEmail,
    to,
    subject: `【振込完了】ご注文番号: ${orderNumber}`,
    attachments,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>お振込みが完了しました</h2>
        <p>この度は買取をご利用いただきありがとうございます。</p>
        <p>下記の内容でお振込みを完了いたしましたので、ご確認ください。</p>

        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0 0 4px; color: #666; font-size: 14px;">ご注文番号</p>
          <p style="margin: 0 0 12px; font-size: 20px; font-weight: bold; font-family: monospace;">${orderNumber}</p>
          <p style="margin: 0 0 4px; color: #666; font-size: 14px;">お振込金額</p>
          <p style="margin: 0; font-size: 24px; font-weight: bold;">${amount.toLocaleString()}円</p>
        </div>

        <p style="font-size: 14px; color: #666;">
          お振込みの反映までに数日かかる場合がございます。<br>
          ご不明な点がございましたら、お気軽にお問い合わせください。
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">

        <p style="font-size: 12px; color: #999;">
          このメールは振込完了の通知のため自動送信されています。<br>
          お心当たりのない場合は、このメールを破棄してください。
        </p>
      </div>
    `,
  })

  if (error) {
    console.error('[email] Failed to send payment completion email:', error)
  }
}
