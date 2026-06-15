'use client';

import { useMemo, useState } from 'react';
import { HelpDeskNode, STAFF_HELP_DESK_TREE } from '@/data/staffHelpDeskTree';
import { useMediaQuery } from '@/hooks/useResizableWidth';
import { StaffCard } from './StaffLayoutPrimitives';
import { StaffModuleBody, StaffPageHeader } from './StaffPageHeader';
import { StaffNavIcon } from './StaffNavIcon';
import { ResizableSplit } from './ResizablePanel';

function flattenNodes(nodes: HelpDeskNode[], path: string[] = []): Array<{
  node: HelpDeskNode;
  path: string[];
}> {
  const list: Array<{ node: HelpDeskNode; path: string[] }> = [];
  for (const node of nodes) {
    const currentPath = [...path, node.title];
    list.push({ node, path: currentPath });
    if (node.children) {
      list.push(...flattenNodes(node.children, currentPath));
    }
  }
  return list;
}

function TreeNode({
  node,
  expanded,
  onToggle,
  onSelect,
}: {
  node: HelpDeskNode;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: HelpDeskNode) => void;
}) {
  const hasChildren = !!node.children?.length;

  return (
    <div className="ml-2">
      <div className="flex items-center gap-1">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            className="w-5 text-xs text-neutral-500"
            aria-label="Toggle section"
          >
            {expanded.has(node.id) ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node)}
          className="rounded px-1.5 py-0.5 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          {node.title}
        </button>
      </div>
      {hasChildren && expanded.has(node.id) && (
        <div className="ml-4 border-l border-neutral-200 dark:border-neutral-700 pl-2 space-y-0.5">
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function StaffHelpDesk() {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['amenities', 'dining']));
  const [selectedNode, setSelectedNode] = useState<HelpDeskNode | null>(STAFF_HELP_DESK_TREE[0]);

  const flat = useMemo(() => flattenNodes(STAFF_HELP_DESK_TREE), []);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return flat.filter(({ node, path }) => {
      const text = `${path.join(' ')} ${node.content ?? ''}`.toLowerCase();
      return text.includes(q);
    });
  }, [flat, query]);

  const displayedTree = query.trim()
    ? searchResults.map((entry) => entry.node)
    : STAFF_HELP_DESK_TREE;

  const handleCopy = async (value?: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // no-op
    }
  };

  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const treePanel = (
      <StaffCard className="h-full min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {displayedTree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              expanded={expanded}
              onToggle={(id) =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onSelect={setSelectedNode}
            />
          ))}
        </div>
      </StaffCard>
  );

  const detailPanel = (
      <StaffCard className="min-h-0 min-w-0 flex-1 overflow-hidden flex flex-col">
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
            {selectedNode?.title ?? 'Select an item'}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {selectedNode?.content ? (
            <>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
                {selectedNode.content}
              </p>
              <button
                type="button"
                onClick={() => void handleCopy(selectedNode.content)}
                className="mt-4 rounded-md border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-300"
              >
                Copy info
              </button>
            </>
          ) : (
            <p className="text-sm text-neutral-500">
              Select a leaf item to view and copy guest-facing information.
            </p>
          )}
        </div>
      </StaffCard>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <StaffPageHeader
        icon={<StaffNavIcon nav="help-desk" />}
        title="Help desk"
        subtitle="Guest-facing answers for front desk"
        toolbar={
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search hotel knowledge…"
            className="w-full max-w-md rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500"
          />
        }
      />
      <StaffModuleBody className="p-4 md:p-5">
      {isDesktop ? (
        <ResizableSplit
          storageKey="staff-help-desk"
          defaultLeftWidth={320}
          minLeft={240}
          maxLeft={520}
          className="min-h-0 flex-1"
          left={treePanel}
          right={detailPanel}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {treePanel}
          {detailPanel}
        </div>
      )}
      </StaffModuleBody>
    </div>
  );
}

