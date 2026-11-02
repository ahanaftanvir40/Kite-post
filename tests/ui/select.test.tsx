// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";

const OPTIONS = [
  { value: "a", label: "Apple" },
  { value: "b", label: "Banana", disabled: true },
  { value: "c", label: "Cherry" },
  { value: "d", label: "Date" },
];

function Harness({ onChange = () => undefined }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("a");
  return (
    <Select
      aria-label="Fruit"
      value={value}
      options={OPTIONS}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

describe("Select", () => {
  it("shows the chosen label and opens a styled list with the chosen option marked", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole("combobox", { name: "Fruit" });
    expect(box).toHaveTextContent("Apple");
    expect(box).toHaveAttribute("aria-expanded", "false");
    await user.click(box);
    expect(box).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByRole("option", { name: "Apple" })).toHaveAttribute("aria-selected", "true");
  });

  it("chooses with a click and closes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Cherry" }));
    expect(onChange).toHaveBeenCalledWith("c");
    expect(screen.getByRole("combobox")).toHaveTextContent("Cherry");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("works from the keyboard and skips disabled options", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    screen.getByRole("combobox").focus();
    await user.keyboard("{ArrowDown}"); // opens on Apple
    await user.keyboard("{ArrowDown}"); // Banana is disabled, so Cherry
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("c");
    expect(screen.getByRole("combobox")).toHaveFocus();

    await user.keyboard("{Enter}{End}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("d");
  });

  it("jumps by typing a letter", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    screen.getByRole("combobox").focus();
    await user.keyboard("{Enter}d{Enter}");
    expect(onChange).toHaveBeenCalledWith("d");
  });

  it("closes on Escape and on an outside click without changing anything", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <button>elsewhere</button>
        <Harness onChange={onChange} />
      </>,
    );
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores a disabled option and a disabled select", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Banana" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    rerender(<Select aria-label="Fruit" value="a" options={OPTIONS} onChange={onChange} disabled />);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("combobox"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes only itself on Escape when inside a dialog", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal title="Dialog" onClose={onClose}>
        <Harness />
      </Modal>,
    );
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
