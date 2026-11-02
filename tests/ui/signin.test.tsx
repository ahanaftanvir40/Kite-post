// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { signIn } from "next-auth/react";
import { describe, expect, it, vi } from "vitest";
import { SignInModal } from "@/features/landing/components/SignInModal";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

describe("SignInModal", () => {
  it("offers Google only and sends people to the app afterwards", async () => {
    vi.mocked(signIn).mockReturnValue(new Promise(() => {}));
    render(<SignInModal onClose={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(signIn).toHaveBeenCalledWith("google", { redirectTo: "/app" });
    expect(screen.getByRole("button", { name: /opening google/i })).toBeDisabled();
  });

  it("shows an error and re-enables the button when Google can't be reached", async () => {
    vi.mocked(signIn).mockRejectedValue(new Error("offline"));
    render(<SignInModal onClose={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/could not reach google/i));
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeEnabled();
  });
});
