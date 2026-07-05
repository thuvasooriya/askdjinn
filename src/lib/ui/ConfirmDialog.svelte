<script lang="ts">
    // ConfirmDialog: reusable "are you sure?" prompt for destructive or
    // otherwise irreversible actions (clear all data, delete account, etc).
    // Wraps bits-ui's AlertDialog so focus-trap, Escape-to-cancel, and
    // scroll-lock all come for free — no bespoke modal plumbing per call site.
    import { AlertDialog } from "bits-ui";
    import { AlertTriangle } from "@lucide/svelte";
    import { cn } from "$lib/utils";
    import { buttonVariants } from "$lib/ui/Button.svelte";

    let {
        open = $bindable(false),
        title,
        description,
        confirmLabel = "Confirm",
        cancelLabel = "Cancel",
        variant = "default",
        onConfirm,
    }: {
        open?: boolean;
        title: string;
        description?: string;
        confirmLabel?: string;
        cancelLabel?: string;
        variant?: "default" | "destructive";
        onConfirm: () => void;
    } = $props();

    function confirm() {
        onConfirm();
        open = false;
    }
</script>

<AlertDialog.Root bind:open>
    <AlertDialog.Portal>
        <AlertDialog.Overlay
            class="fixed inset-0 z-[70] bg-black/70 backdrop-blur-md data-[state=open]:animate-fade-in"
        />
        <AlertDialog.Content
            class="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-float data-[state=open]:animate-scale-in"
        >
            <div class="flex items-start gap-3">
                <div
                    class={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        variant === "destructive"
                            ? "bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]"
                            : "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
                    )}
                >
                    <AlertTriangle class="h-4.5 w-4.5" />
                </div>
                <div class="min-w-0 flex-1 pt-0.5">
                    <AlertDialog.Title
                        class="text-sm font-bold text-[var(--color-foreground)]"
                        >{title}</AlertDialog.Title
                    >
                    {#if description}
                        <AlertDialog.Description
                            class="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]"
                        >
                            {description}
                        </AlertDialog.Description>
                    {/if}
                </div>
            </div>
            <div class="mt-5 flex justify-end gap-2">
                <AlertDialog.Cancel
                    class={buttonVariants({ variant: "secondary", size: "md" })}
                >
                    {cancelLabel}
                </AlertDialog.Cancel>
                <button
                    type="button"
                    class={buttonVariants({ variant: variant === "destructive" ? "destructive" : "primary", size: "md" })}
                    onclick={confirm}
                >
                    {confirmLabel}
                </button>
            </div>
        </AlertDialog.Content>
    </AlertDialog.Portal>
</AlertDialog.Root>
