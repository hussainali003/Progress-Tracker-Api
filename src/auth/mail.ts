import {Resend} from "resend";

let resend: Resend | null = null;

const getResend = () => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set — cannot send emails");
  }
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
};

export const sendPasswordResetEmail = async (to: string, resetLink: string) => {
  await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to,
    subject: "Reset your password",
    html: `<p>You requested a password reset.</p><p><a href="${resetLink}">Click here to reset your password</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  });
};
