// This is a widget to spec Flex designs and annotate components with component IDs for better handoff to eng
type ComponentTypes = 'highConfidence' | 'unclear' | 'custom';
interface DynamicComponentsState {
	id: ReturnType<typeof uid>;
	type: ComponentTypes;
	value: string;
}

const { widget } = figma;
const {
	useEffect,
	waitForTask,
	useSyncedState,
	usePropertyMenu,
	AutoLayout,
	Text,
	SVG,
	Input,
} = widget;

const uid = () =>
	String(Date.now().toString(32) + Math.random().toString(16)).replace(
		/\./g,
		''
	);

// JavaScript Object which maps component types to the fill colours
const COMPONENTS_COLOURS_FILL = {
	highConfidence: '#1A73E8',
	unclear: '#C28AF5',
	custom: '#858585',
};

interface TextState {
	[key: ReturnType<typeof uid>]: string;
}

function Widget() {
	const [note, setNote] = useSyncedState('note', '');
	const [title, setTitle] = useSyncedState('title', '');
	const [dynamicComponents, setDynamicComponents] = useSyncedState<
		DynamicComponentsState[]
	>('dynamicComponents', []);
	const [gsheetData, setGsheetData] = useSyncedState<string[] | null>(
		'gsheetData',
		null
	);
	// console.log({ dynamicComponents });
	async function fetchDataFromGoogleSheet(): Promise<string[]> {
		const GOOGLE_SHEET_URL =
			'https://docs.google.com/spreadsheets/d/1BN006aKzIEJ1RTBvVOff8zMKIkXW9ZKyT4nrJMINm6w/gviz/tq?tqx=out:json&tq&gid=0';
		const CLOUD_FN_URL =
			'https://us-central1-figmaproxy.cloudfunctions.net/fetchFromGoogleSheet';
		try {
			const response = await fetch(`${CLOUD_FN_URL}?url=${GOOGLE_SHEET_URL}`, {
				headersObject: {
					'access-control-allow-origin': '*',
				},
			});
			if (!response.ok) {
				throw new Error('Gsheet fetch unsuccessful!');
			}
			const dataAsText = await response.text();
			const parsed = JSON.parse(dataAsText);
			return parsed;
		} catch (e) {
			console.error('error in fetchDataFromGoogleSheet', e);
			throw new Error(String(e));
		}
	}

	useEffect(() => {
		if (!gsheetData) {
			waitForTask(
				new Promise(async (resolve) => {
					figma.showUI(``, { visible: false });
					try {
						const sheetData = await fetchDataFromGoogleSheet();
						setGsheetData(sheetData);
						resolve(gsheetData);
						figma.closePlugin();
					} catch (e) {
						console.error('error in useEffect', String(e));
						figma.closePlugin();
						resolve(e);
					}
				})
			);
		}
	});

	useEffect(() => {
		figma.ui.onmessage = (message) => {
			if (message.type === 'searchitemselection') {
				setDynamicComponents((prevComponents) =>
					prevComponents.reduce<DynamicComponentsState[]>(
						(finalState, component) => {
							return [
								...finalState,
								component.id === message.id
									? { ...component, value: message.value }
									: component,
							];
						},
						[]
					)
				);
				figma.closePlugin('Applied with success!');
			}
		};
	});

	const importFromSelection = () => {
		const { selection } = figma.currentPage;
		if (selection.length) {
			const componentsToCreate = selection.reduce<DynamicComponentsState[]>(
				(finalComponents, component) => {
					if (
						component.type === 'COMPONENT' ||
						component.type === 'COMPONENT_SET'
					) {
						const value = component.description || 'no description present!';
						finalComponents.push({
							id: uid(),
							type: gsheetData?.includes(value) ? 'highConfidence' : 'custom',
							value,
						});
					}
					if (component.type === 'FRAME') {
						const children = component.children;
						children.forEach((child) => {
							if (
								child.type === 'COMPONENT' ||
								child.type === 'COMPONENT_SET'
							) {
								const value = child.description;
								finalComponents.push({
									id: uid(),
									type: gsheetData?.includes(value)
										? 'highConfidence'
										: 'custom',
									value,
								});
							}
							if (child.type === 'INSTANCE') {
								const value = child.mainComponent?.description ?? '';
								finalComponents.push({
									id: uid(),
									type: gsheetData?.includes(value)
										? 'highConfidence'
										: 'custom',
									value,
								});
							}
							if (child.type === 'FRAME') {
								finalComponents.push({
									id: uid(),
									type: 'custom',
									value: child.name,
								});
							}
						});
					}
					return finalComponents;
				},
				[]
			);
			setDynamicComponents((prevState) => [
				...prevState,
				...componentsToCreate,
			]);
		}
	};

	/**
	 * Function that removes a flex component from the list.
	 *
	 * @param index - current index of the array
	 * @returns - returns a new state by filtering out the current index
	 */
	const removeFlexComponent = (index: number) => {
		setDynamicComponents((prevState) => [
			...prevState.filter((_, i) => index !== i),
		]);
	};

	const openFlexComponentIframe = (id: DynamicComponentsState['id']) => {
		return new Promise(() => {
			figma.showUI(__uiFiles__.gsheetData, {
				title: 'Flex components',
			});
			figma.ui.postMessage({
				gsheetData,
				id,
			});
		});
	};

	const changeComponentType = (id: string) => {
		setDynamicComponents((prevComponents) =>
			prevComponents.reduce<DynamicComponentsState[]>(
				(finalState, component) => {
					const previousType = component.type;
					return [
						...finalState,
						component.id === id
							? {
									...component,
									type:
										previousType === 'highConfidence'
											? 'unclear'
											: 'highConfidence',
							  }
							: component,
					];
				},
				[]
			)
		);
	};

	/**
	 * Function that creates the list of flex components dynamically.
	 * Runs on every click of the plus buttons
	 *
	 * @param type - Flex component type
	 * @param index - current index of the array
	 * @returns Array - Array of React components
	 */
	function generateDynamicComponents(
		{ id, type, value }: DynamicComponentsState,
		index: number
	) {
		return (
			<AutoLayout
				key={id}
				name={`component-${type}-${id}`}
				stroke="#DBDBE0"
				cornerRadius={8}
				overflow="visible"
				spacing={8}
				padding={{
					vertical: 8,
					horizontal: 8,
				}}
				width="fill-parent"
				verticalAlignItems="center"
			>
				<AutoLayout
					name="Ellipse"
					fill={type === 'custom' ? undefined : COMPONENTS_COLOURS_FILL[type]}
					stroke={type === 'custom' ? '#00000075' : undefined}
					cornerRadius={100}
					overflow="visible"
					width={22}
					height={22}
					horizontalAlignItems="center"
					verticalAlignItems="center"
					onClick={
						type === 'custom' ? undefined : () => changeComponentType(id)
					}
				>
					<Text
						name="number"
						fill={type === 'custom' ? COMPONENTS_COLOURS_FILL.custom : '#FFF'}
						fontWeight={600}
						width={6}
						verticalAlignText="center"
						horizontalAlignText="center"
						fontFamily="Inter"
						fontSize={12}
						letterSpacing={0.1}
					>
						{index + 1}
					</Text>
				</AutoLayout>

				{type === 'custom' ? (
					<Input
						name="Input"
						value={
							dynamicComponents.find(({ id: compId }) => compId === id)
								?.value || ''
						}
						placeholder="add a name"
						onTextEditEnd={(e) => {
							setDynamicComponents((prevComponents) =>
								prevComponents.reduce<DynamicComponentsState[]>(
									(finalState, component) => {
										return [
											...finalState,
											component.id === id
												? { ...component, value: e.characters }
												: component,
										];
									},
									[]
								)
							);
						}}
						fontSize={13}
						fontWeight={400}
						fill="#000"
						width="fill-parent"
						verticalAlignText="center"
						inputFrameProps={{
							padding: 4,
						}}
						inputBehavior="wrap"
					/>
				) : (
					<Text
						name="Select component name"
						onClick={() => openFlexComponentIframe(id)}
						fontSize={13}
						fontWeight={400}
						fill="#000"
						width="fill-parent"
						verticalAlignText="center"
					>
						{value || 'Select component name'}
					</Text>
				)}

				<AutoLayout
					name="Close24Px"
					strokeWidth={0.926}
					overflow="visible"
					padding={{
						top: 4,
						right: 6,
						bottom: 4,
						left: 4,
					}}
					onClick={() => removeFlexComponent(index)}
				>
					<SVG
						name="Vector"
						height={10}
						width={10}
						src="<svg width='10' height='10' viewBox='0 0 10 10' fill='none' xmlns='http://www.w3.org/2000/svg'>
                <path d='M10 1.00714L8.99286 0L5 3.99286L1.00714 0L0 1.00714L3.99286 5L0 8.99286L1.00714 10L5 6.00714L8.99286 10L10 8.99286L6.00714 5L10 1.00714Z' fill='#8F9092'/>
                </svg>
                "
					/>
				</AutoLayout>
			</AutoLayout>
		);
	}

	return (
		<AutoLayout
			name="Widget"
			effect={[
				{
					type: 'drop-shadow',
					color: '#00000040',
					offset: {
						x: 0,
						y: 2,
					},
					blur: 2,
					showShadowBehindNode: false,
				},
				{
					type: 'drop-shadow',
					color: '#00000040',
					offset: {
						x: 0,
						y: 0,
					},
					blur: 7,
					showShadowBehindNode: false,
				},
			]}
			fill="#FFF"
			cornerRadius={16}
			overflow="visible"
			direction="vertical"
			spacing={14}
			width={360}
			padding={{
				vertical: 24,
				horizontal: 18,
			}}
		>
			{/* TITLE FIELD */}
			<AutoLayout
				name="Title"
				overflow="visible"
				direction="vertical"
				spacing={8}
				width="fill-parent"
			>
				{/* Auto layout for Title */}
				<AutoLayout
					name="level"
					overflow="visible"
					spacing={8}
					width="fill-parent"
				>
					{/* Title field*/}

					<Input
						name="Input"
						value={title}
						placeholder="Screen title"
						onTextEditEnd={(e) => {
							setTitle(e.characters);
						}}
						fontSize={34}
						fill="#000"
						width="fill-parent"
						verticalAlignText="center"
						inputFrameProps={{
							padding: 4,
						}}
						inputBehavior="wrap"
					/>
				</AutoLayout>
			</AutoLayout>

			{/* LINE */}
			<AutoLayout
				name="line-seperator"
				overflow="visible"
				direction="vertical"
				spacing={12}
				padding={{
					vertical: 7,
					horizontal: 0,
				}}
				width="fill-parent"
			>
				<AutoLayout
					name="line"
					fill="#DADCE0"
					overflow="visible"
					direction="vertical"
					spacing={9}
					padding={4}
					width="fill-parent"
					height={1}
				/>
			</AutoLayout>

			{/* COMPONENTS section */}
			{dynamicComponents.length ? (
				<AutoLayout
					name="Components"
					overflow="visible"
					direction="vertical"
					spacing={8}
					width="fill-parent"
				>
					{/* Autolayot which wraps Components and Reorder */}
					<AutoLayout
						name="Components"
						overflow="visible"
						direction="horizontal"
						spacing="auto"
						width="fill-parent"
					>
						<Text
							name="Components"
							fill="#808180"
							verticalAlignText="center"
							lineHeight={24}
							fontFamily="Inter"
							fontSize={13}
							letterSpacing={0.1}
						>
							Components
						</Text>

						<Text
							name="Reorder"
							fill="#808180"
							verticalAlignText="center"
							lineHeight={24}
							fontFamily="Inter"
							fontSize={13}
							letterSpacing={0.1}
							horizontalAlignText="right"
						>
							Reorder
						</Text>
					</AutoLayout>

					{/* Auto layout for INPUT + ELLIPSE */}
					<AutoLayout
						name="Input field"
						overflow="visible"
						spacing={8}
						width="fill-parent"
						direction="vertical"
					>
						{/* Input field with number [high confidence, unclear, custom] */}
						{dynamicComponents.map(generateDynamicComponents)}
					</AutoLayout>
				</AutoLayout>
			) : null}

			{/* Options */}
			<AutoLayout
				name="Options"
				overflow="visible"
				direction="vertical"
				spacing={2}
				width="fill-parent"
				padding={{
					top: 6,
					right: 0,
					bottom: 0,
					left: 0,
				}}
			>
				{/* Add Flex component: OPTION */}
				<AutoLayout
					name="Add high confidence flex component"
					cornerRadius={9}
					overflow="visible"
					spacing={9}
					padding={{
						top: 6,
						right: 0,
						bottom: 6,
						left: 8,
					}}
					width="fill-parent"
					verticalAlignItems="center"
					onClick={() =>
						setDynamicComponents((prevState) => [
							...prevState,
							{ id: uid(), type: 'highConfidence', value: '' },
						])
					}
					hoverStyle={{
						fill: '#F0F1F2',
					}}
				>
					<AutoLayout
						name="add_24px"
						strokeWidth={0.926}
						overflow="visible"
						spacing={4}
						padding={3}
					>
						<SVG
							name="icon"
							height={13}
							width={13}
							src="<svg width='12' height='12' viewBox='0 0 12 12' fill='' xmlns='http://www.w3.org/2000/svg'>
              <path d='M12 6.75H6.75V12H5.25V6.75H0V5.25H5.25V0H6.75V5.25H12V6.75Z' fill='#8F9092'/>
              </svg>
              "
						/>
					</AutoLayout>
					<Text
						name="Add flex component"
						fill="#808180"
						verticalAlignText="center"
						lineHeight={24}
						fontFamily="Inter"
						fontWeight={500}
						fontSize={13}
						letterSpacing={0.1}
						hoverStyle={{
							fill: '#222',
						}}
					>
						Add high confidence flex component
					</Text>
				</AutoLayout>

				{/* Add custom component : OPTION */}
				<AutoLayout
					name="Add flex component with unclear usage"
					cornerRadius={9}
					overflow="visible"
					spacing={9}
					padding={{
						top: 6,
						right: 0,
						bottom: 6,
						left: 8,
					}}
					width="fill-parent"
					verticalAlignItems="center"
					onClick={() =>
						setDynamicComponents((prevState) => [
							...prevState,
							{ id: uid(), type: 'unclear', value: '' },
						])
					}
					hoverStyle={{
						fill: '#F0F1F2',
					}}
				>
					<AutoLayout
						name="add_24px"
						strokeWidth={0.926}
						overflow="visible"
						spacing={4}
						padding={3}
					>
						<SVG
							name="icon"
							height={13}
							width={13}
							src="<svg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'>
<path d='M12 6.75H6.75V12H5.25V6.75H0V5.25H5.25V0H6.75V5.25H12V6.75Z' fill='#8F9092'/>
</svg>
"
						/>
					</AutoLayout>
					<Text
						name="Add flex component with unclear usage"
						fill="#808180"
						verticalAlignText="center"
						lineHeight={24}
						fontFamily="Inter"
						fontSize={13}
						fontWeight={500}
						letterSpacing={0.1}
						hoverStyle={{
							fill: '#222',
						}}
					>
						Add flex component with unclear usage
					</Text>
				</AutoLayout>

				{/* Add custom component : OPTION */}
				<AutoLayout
					name="Add custom component"
					cornerRadius={9}
					overflow="visible"
					spacing={9}
					padding={{
						top: 6,
						right: 0,
						bottom: 6,
						left: 8,
					}}
					width="fill-parent"
					verticalAlignItems="center"
					onClick={() =>
						setDynamicComponents((prevState) => [
							...prevState,
							{ id: uid(), type: 'custom', value: '' },
						])
					}
					hoverStyle={{
						fill: '#F0F1F2',
					}}
				>
					<AutoLayout
						name="add_24px"
						strokeWidth={0.926}
						overflow="visible"
						spacing={4}
						padding={3}
					>
						<SVG
							name="icon"
							height={13}
							width={13}
							src="<svg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'>
<path d='M12 6.75H6.75V12H5.25V6.75H0V5.25H5.25V0H6.75V5.25H12V6.75Z' fill='#8F9092'/>
</svg>
"
						/>
					</AutoLayout>
					<Text
						name="Add custom component"
						fill="#808180"
						verticalAlignText="center"
						lineHeight={24}
						fontFamily="Inter"
						fontSize={13}
						fontWeight={500}
						letterSpacing={0.1}
						hoverStyle={{
							fill: '#222',
						}}
					>
						Add custom component
					</Text>
				</AutoLayout>

				{/* Import from selection : OPTION */}
				<AutoLayout
					name="Import from selection"
					cornerRadius={9}
					overflow="visible"
					spacing={9}
					padding={{
						top: 6,
						right: 0,
						bottom: 6,
						left: 8,
					}}
					width="fill-parent"
					verticalAlignItems="center"
					onClick={importFromSelection}
					hoverStyle={{
						fill: '#F0F1F2',
					}}
				>
					<AutoLayout
						name="select_all_24px"
						strokeWidth={0.926}
						overflow="visible"
						spacing={4}
						padding={2}
					>
						<SVG
							name="icon"
							height={16}
							width={16}
							src="<svg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'>
<path fill-rule='evenodd' clip-rule='evenodd' d='M1.5 1.75H0C0 0.925 0.675 0.25 1.5 0.25V1.75ZM1.5 7.75H0V6.25H1.5V7.75ZM3 13.75H4.5V12.25H3V13.75ZM1.5 4.75H0V3.25H1.5V4.75ZM7.5 0.25H6V1.75H7.5V0.25ZM12 1.75V0.25C12.825 0.25 13.5 0.925 13.5 1.75H12ZM1.5 13.75V12.25H0C0 13.075 0.675 13.75 1.5 13.75ZM1.5 10.75H0V9.25H1.5V10.75ZM4.5 0.25H3V1.75H4.5V0.25ZM7.5 13.75H6V12.25H7.5V13.75ZM12 7.75H13.5V6.25H12V7.75ZM13.5 12.25C13.5 13.075 12.825 13.75 12 13.75V12.25H13.5ZM12 4.75H13.5V3.25H12V4.75ZM13.5 10.75H12V9.25H13.5V10.75ZM9 13.75H10.5V12.25H9V13.75ZM10.5 1.75H9V0.25H10.5V1.75ZM3 10.75H10.5V3.25H3V10.75ZM9 4.75H4.5V9.25H9V4.75Z' fill='#8F9092'/>
</svg>
"
						/>
					</AutoLayout>
					<Text
						name="Import components from selection"
						fill="#808180"
						verticalAlignText="center"
						lineHeight={24}
						fontFamily="Inter"
						fontWeight={500}
						fontSize={13}
						letterSpacing={0.1}
						hoverStyle={{
							fill: '#222',
						}}
					>
						Import component IDs from selection
					</Text>
				</AutoLayout>

				{/* Add note : OPTION */}
				<AutoLayout
					name="Add note"
					cornerRadius={9}
					overflow="visible"
					spacing={9}
					padding={{
						top: 6,
						right: 0,
						bottom: 6,
						left: 8,
					}}
					width="fill-parent"
					verticalAlignItems="center"
					onClick={() => void 0}
					hoverStyle={{
						fill: '#F0F1F2',
					}}
				>
					<AutoLayout
						name="add_24px"
						strokeWidth={0.926}
						overflow="visible"
						spacing={4}
						padding={3}
					>
						<SVG
							name="icon"
							height={16}
							width={16}
							src="<svg width='14' height='12' viewBox='0 0 14 12' fill='none' xmlns='http://www.w3.org/2000/svg'>
              <path d='M0.25 3.5H8.5V5H0.25V3.5ZM0.25 2H8.5V0.5H0.25V2ZM0.25 8H5.5V6.5H0.25V8ZM11.5075 5.6525L12.04 5.12C12.3325 4.8275 12.805 4.8275 13.0975 5.12L13.63 5.6525C13.9225 5.945 13.9225 6.4175 13.63 6.71L13.0975 7.2425L11.5075 5.6525ZM10.975 6.185L7 10.16V11.75H8.59L12.565 7.775L10.975 6.185Z' fill='#8F9092'/>
              </svg>
              "
						/>
					</AutoLayout>
					<Text
						name="Add custom component"
						fill="#808180"
						verticalAlignText="center"
						lineHeight={24}
						fontFamily="Inter"
						fontSize={13}
						fontWeight={500}
						letterSpacing={0.1}
						hoverStyle={{
							fill: '#222',
						}}
					>
						Add note
					</Text>
				</AutoLayout>
			</AutoLayout>

			{/* LINE  */}
			<AutoLayout
				name="line-seperator"
				overflow="visible"
				direction="vertical"
				spacing={12}
				padding={{
					vertical: 7,
					horizontal: 0,
				}}
				width="fill-parent"
			>
				<AutoLayout
					name="line"
					fill="#DADCE0"
					overflow="visible"
					direction="vertical"
					spacing={9}
					padding={4}
					width="fill-parent"
					height={1}
				/>
			</AutoLayout>

			{/* NOTES */}
			<AutoLayout
				name="Notes"
				overflow="visible"
				direction="vertical"
				spacing={8}
				width="fill-parent"
			>
				<Text
					name="Note"
					fill="#808180"
					verticalAlignText="center"
					lineHeight={24}
					fontFamily="Inter"
					fontSize={13}
					letterSpacing={0.1}
				>
					Notes
				</Text>

				<AutoLayout
					name="Note Field"
					overflow="visible"
					spacing={8}
					width={324}
				>
					<AutoLayout
						name="Note"
						stroke="#DBDBE0"
						cornerRadius={8}
						overflow="visible"
						direction="vertical"
						spacing={4}
						padding={8}
						width="fill-parent"
						verticalAlignItems="center"
					>
						<AutoLayout
							name="User"
							overflow="visible"
							width="fill-parent"
							spacing={8}
							padding={{
								top: 0,
								right: 0,
								bottom: 0,
								left: 2,
							}}
							verticalAlignItems="center"
						>
							<AutoLayout
								name="field_number"
								fill={{
									type: 'image',
									src: 'https://lh3.googleusercontent.com/a-/AFdZucr35CB_ZnJbPOTeugL_8PjHc6L1l5IIXRLScF65=s600-p',
									imageRef: 'cff3e72f0ffd376c3984dad92b6c5f8ff0793de4',
									imageTransform: [
										[0.996610164642334, 0, 0.0016949152341112494],
										[0, 1, 0],
									],
									scalingFactor: 0.5,
								}}
								cornerRadius={100}
								overflow="visible"
								width={22}
								height={22}
								horizontalAlignItems="center"
								verticalAlignItems="center"
							/>
							<Text
								name="User and Date"
								width="fill-parent"
								fill="#333"
								verticalAlignText="center"
								lineHeight={22}
								fontFamily="Inter"
								fontSize={13}
								letterSpacing={0.1}
							>
								Andrew Carter
							</Text>

							<AutoLayout
								name="Close24Px"
								strokeWidth={0.926}
								overflow="visible"
								padding={{
									top: 4,
									right: 6,
									bottom: 4,
									left: 4,
								}}
							>
								<SVG
									name="Vector"
									height={10}
									width={10}
									src="<svg width='10' height='10' viewBox='0 0 10 10' fill='none' xmlns='http://www.w3.org/2000/svg'>
                <path d='M10 1.00714L8.99286 0L5 3.99286L1.00714 0L0 1.00714L3.99286 5L0 8.99286L1.00714 10L5 6.00714L8.99286 10L10 8.99286L6.00714 5L10 1.00714Z' fill='#8F9092'/>
                </svg>
                "
								/>
							</AutoLayout>
						</AutoLayout>
						<AutoLayout name="Text" width="fill-parent">
							<Input
								name="Input"
								value={note}
								placeholder="Add notes for Eng"
								onTextEditEnd={(e) => {
									setNote(e.characters);
								}}
								fontSize={13}
								lineHeight={22}
								fontWeight={400}
								fill="#000"
								width="fill-parent"
								verticalAlignText="center"
								inputFrameProps={{
									//stroke: "#DBDBE0",
									//cornerRadius: 8,
									padding: 4,
								}}
								inputBehavior="wrap"
							/>
						</AutoLayout>
					</AutoLayout>
				</AutoLayout>
			</AutoLayout>

			{/* LINE  */}
			<AutoLayout
				name="line-seperator"
				overflow="visible"
				direction="vertical"
				spacing={12}
				padding={{
					vertical: 7,
					horizontal: 0,
				}}
				width="fill-parent"
			>
				<AutoLayout
					name="line"
					fill="#DADCE0"
					overflow="visible"
					direction="vertical"
					spacing={9}
					padding={4}
					width="fill-parent"
					height={1}
				/>
			</AutoLayout>

			{/* COMPONENTS SUBMITTED GROUP*/}
			<AutoLayout
				name="Components"
				overflow="visible"
				direction="vertical"
				spacing={16}
				width={324}
			>
				<Text
					name="Components"
					fill="#808180"
					verticalAlignText="center"
					lineHeight={24}
					fontFamily="Inter"
					fontSize={13}
					letterSpacing={0.1}
				>
					Components
				</Text>

				{/* COMPONENT */}
				<AutoLayout
					name="Component"
					cornerRadius={8}
					overflow="visible"
					spacing={12}
					width="fill-parent"
					verticalAlignItems="center"
				>
					<AutoLayout
						name="Ellipse"
						fill="#1A73E8"
						cornerRadius={100}
						overflow="visible"
						width={28}
						height={28}
						horizontalAlignItems="center"
						verticalAlignItems="center"
					>
						<Text
							name="number"
							fill="#FFF"
							verticalAlignText="center"
							horizontalAlignText="center"
							fontFamily="Inter"
							fontSize={12}
							letterSpacing={0.1}
							fontWeight={600}
						>
							1
						</Text>
					</AutoLayout>
					<AutoLayout name="Frame" padding={4} width="fill-parent">
						<Text
							name="Input"
							opacity={0.3}
							x={4}
							y={4}
							positioning="absolute"
							hidden={true}
							fill="#000"
							width="fill-parent"
							verticalAlignText="center"
							fontFamily="Inter"
							fontSize={13}
						>
							flex.comp.component
						</Text>
						<Text
							name="Input"
							fill="#3C4043"
							width="fill-parent"
							verticalAlignText="center"
							lineHeight={24}
							fontFamily="Inter"
							fontSize={15}
							letterSpacing={0.1}
						>
							flex.comp.list-item-text-only
						</Text>
					</AutoLayout>
				</AutoLayout>

				{/* COMPONENT */}
				<AutoLayout
					name="Component"
					cornerRadius={8}
					overflow="visible"
					spacing={12}
					width="fill-parent"
					verticalAlignItems="center"
				>
					<AutoLayout
						name="Ellipse"
						fill="#C28AF5"
						cornerRadius={100}
						overflow="visible"
						width={28}
						height={28}
						horizontalAlignItems="center"
						verticalAlignItems="center"
					>
						<Text
							name="number"
							fill="#FFF"
							verticalAlignText="center"
							horizontalAlignText="center"
							fontFamily="Inter"
							fontSize={12}
							letterSpacing={0.1}
							fontWeight={600}
						>
							1
						</Text>
					</AutoLayout>
					<AutoLayout name="Frame" padding={4} width="fill-parent">
						<Text
							name="Input"
							opacity={0.3}
							x={4}
							y={4}
							positioning="absolute"
							hidden={true}
							fill="#000"
							width="fill-parent"
							verticalAlignText="center"
							fontFamily="Inter"
							fontSize={13}
						>
							flex.comp.component
						</Text>
						<Text
							name="Input"
							fill="#3C4043"
							width="fill-parent"
							verticalAlignText="center"
							lineHeight={24}
							fontFamily="Inter"
							fontSize={15}
							letterSpacing={0.1}
						>
							flex.comp.list-item-media
						</Text>
					</AutoLayout>
				</AutoLayout>

				{/* COMPONENT */}
				<AutoLayout
					name="Component"
					cornerRadius={8}
					overflow="visible"
					spacing={12}
					width="fill-parent"
					verticalAlignItems="center"
				>
					<AutoLayout
						name="Ellipse"
						stroke="#00000075"
						cornerRadius={100}
						overflow="visible"
						width={28}
						height={28}
						horizontalAlignItems="center"
						verticalAlignItems="center"
					>
						<Text
							name="number"
							fill="#858585"
							verticalAlignText="center"
							horizontalAlignText="center"
							fontFamily="Inter"
							fontSize={13}
							letterSpacing={0.1}
							fontWeight={600}
						>
							1
						</Text>
					</AutoLayout>
					<AutoLayout name="Frame" padding={4} width="fill-parent">
						<Text
							name="Input"
							opacity={0.3}
							x={4}
							y={4}
							positioning="absolute"
							hidden={true}
							fill="#000"
							width="fill-parent"
							verticalAlignText="center"
							fontFamily="Inter"
							fontSize={13}
						>
							flex.comp.component
						</Text>
						<Text
							name="Input"
							fill="#3C4043"
							width="fill-parent"
							verticalAlignText="center"
							lineHeight={24}
							fontFamily="Inter"
							fontSize={15}
							letterSpacing={0.1}
						>
							flex.comp.list-item-media
						</Text>
					</AutoLayout>
				</AutoLayout>
			</AutoLayout>

			{/* LINE  */}
			<AutoLayout
				name="line-seperator"
				overflow="visible"
				direction="vertical"
				spacing={12}
				padding={{
					vertical: 7,
					horizontal: 0,
				}}
				width="fill-parent"
			>
				<AutoLayout
					name="line"
					fill="#DADCE0"
					overflow="visible"
					direction="vertical"
					spacing={9}
					padding={4}
					width="fill-parent"
					height={1}
				/>
			</AutoLayout>

			{/* NOTES SUBMITTED GROUP*/}
			<AutoLayout
				name="Comment"
				overflow="visible"
				direction="vertical"
				padding={{
					vertical: 0,
					horizontal: 4,
				}}
				spacing={8}
				width="fill-parent"
			>
				<AutoLayout
					name="Comment User"
					overflow="visible"
					spacing={8}
					width="fill-parent"
				>
					<AutoLayout
						name="Avatar"
						fill={{
							type: 'image',
							src: 'https://lh3.googleusercontent.com/a-/AFdZucr35CB_ZnJbPOTeugL_8PjHc6L1l5IIXRLScF65=s600-p',
							imageRef: 'cff3e72f0ffd376c3984dad92b6c5f8ff0793de4',
							imageTransform: [
								[0.996610164642334, 0, 0.0016949152341112494],
								[0, 1, 0],
							],
							scalingFactor: 0.5,
						}}
						cornerRadius={100}
						overflow="visible"
						width={22}
						height={22}
						horizontalAlignItems="center"
						verticalAlignItems="center"
					/>
					<Text
						name="Timestamp"
						fill="#B3B3B3"
						width="fill-parent"
						verticalAlignText="center"
						lineHeight={22}
						fontFamily="Inter"
						fontSize={13}
						letterSpacing={0.1}
					>
						Andrew Carter - 12/09/2022
					</Text>
				</AutoLayout>
				<Text
					name="Comment"
					fill="#333"
					width="fill-parent"
					verticalAlignText="center"
					lineHeight={22}
					fontFamily="Inter"
					fontSize={13}
					letterSpacing={0.1}
				>
					The 1:1 component is a work in progress and should be added to the
					library soon as noted by @carterandrew.
				</Text>
			</AutoLayout>

			{/* LINE  */}
			<AutoLayout
				name="line-seperator"
				overflow="visible"
				direction="vertical"
				spacing={12}
				padding={{
					vertical: 7,
					horizontal: 0,
				}}
				width="fill-parent"
			>
				<AutoLayout
					name="line"
					fill="#DADCE0"
					overflow="visible"
					direction="vertical"
					spacing={9}
					padding={4}
					width="fill-parent"
					height={1}
				/>
			</AutoLayout>

			{/* Legend */}
			<AutoLayout
				name="Legend"
				overflow="visible"
				direction="vertical"
				spacing={14}
				padding={{
					top: 0,
					right: 0,
					bottom: 0,
					left: 7,
				}}
				width="fill-parent"
			>
				{/* High confidence component */}
				<AutoLayout
					name="Legend Flex"
					overflow="visible"
					spacing={7}
					width="fill-parent"
					verticalAlignItems="center"
				>
					<SVG
						name="Rectangle"
						height={12}
						width={12}
						src="<svg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'>
            <path d='M0 7C0 3.13401 3.13401 0 7 0V0C10.866 0 14 3.13401 14 7V7C14 10.866 10.866 14 7 14V14C3.13401 14 0 10.866 0 7V7Z' fill='#1A73E8'/>
            </svg>
            "
					/>
					<Text
						name="Flex component"
						opacity={0.6}
						fill="#808180"
						width="fill-parent"
						lineHeight={18}
						fontFamily="Inter"
						fontSize={14}
						letterSpacing={0.1}
					>
						High confidence component
					</Text>
				</AutoLayout>

				{/* Unclear usage */}
				<AutoLayout
					name="Unclear usage"
					overflow="visible"
					spacing={7}
					width="fill-parent"
					verticalAlignItems="center"
				>
					<SVG
						name="Rectangle"
						height={12}
						width={12}
						src="<svg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'>
            <path d='M0 7C0 3.13401 3.13401 0 7 0V0C10.866 0 14 3.13401 14 7V7C14 10.866 10.866 14 7 14V14C3.13401 14 0 10.866 0 7V7Z' fill='#C28AF5'/>
            </svg>
            "
					/>
					<Text
						name="Custom component not added to flex"
						opacity={0.6}
						fill="#808180"
						width="fill-parent"
						lineHeight={18}
						fontFamily="Inter"
						fontSize={14}
						letterSpacing={0.1}
					>
						Unclear usage
					</Text>
				</AutoLayout>

				{/* Unclear usage */}
				<AutoLayout
					name="Unclear usage"
					overflow="visible"
					spacing={7}
					width="fill-parent"
					verticalAlignItems="center"
				>
					<SVG
						name="Rectangle"
						height={12}
						width={12}
						src="<svg width='13' height='14' viewBox='0 0 13 14' fill='none' xmlns='http://www.w3.org/2000/svg'>
            <path fill-rule='evenodd' clip-rule='evenodd' d='M6.5 12.5C9.53757 12.5 12 10.0376 12 7C12 3.96243 9.53757 1.5 6.5 1.5C3.46243 1.5 1 3.96243 1 7C1 10.0376 3.46243 12.5 6.5 12.5ZM6.5 13.5C10.0899 13.5 13 10.5899 13 7C13 3.41015 10.0899 0.5 6.5 0.5C2.91015 0.5 0 3.41015 0 7C0 10.5899 2.91015 13.5 6.5 13.5Z' fill='#A9A7A7'/>
            </svg>"
					/>
					<Text
						name="Custom component not added to flex"
						opacity={0.6}
						fill="#808180"
						width="fill-parent"
						lineHeight={18}
						fontFamily="Inter"
						fontSize={14}
						letterSpacing={0.1}
					>
						Custom component
					</Text>
				</AutoLayout>
			</AutoLayout>

			{/* LINE  */}
			<AutoLayout
				name="line-seperator"
				overflow="visible"
				direction="vertical"
				spacing={12}
				padding={{
					vertical: 7,
					horizontal: 0,
				}}
				width="fill-parent"
			>
				<AutoLayout
					name="line"
					fill="#DADCE0"
					overflow="visible"
					direction="vertical"
					spacing={9}
					padding={4}
					width="fill-parent"
					height={1}
				/>
			</AutoLayout>

			{/* Time Stamp */}
			<AutoLayout
				name="TimeStamp"
				overflow="visible"
				padding={{
					vertical: 0,
					horizontal: 4,
				}}
				spacing={8}
				width="fill-parent"
			>
				<AutoLayout
					name="User"
					fill={{
						type: 'image',
						src: 'https://lh3.googleusercontent.com/a-/AFdZucr35CB_ZnJbPOTeugL_8PjHc6L1l5IIXRLScF65=s600-p',
						imageRef: '2600934d6c7502adb34e78959dbca397572f4c2b',
						imageTransform: [
							[0.996610164642334, 0, 0.0016949152341112494],
							[0, 1, 0],
						],
						scalingFactor: 0.5,
					}}
					cornerRadius={100}
					overflow="visible"
					width={22}
					height={22}
					horizontalAlignItems="center"
					verticalAlignItems="center"
				/>
				<Text
					name="Spec-ed by Andrew Carter - 12/09/2022"
					fill="#B3B3B3"
					width={254}
					verticalAlignText="center"
					lineHeight={22}
					fontFamily="Inter"
					fontSize={13}
					letterSpacing={0.1}
				>
					Spec-ed by Andrew Carter - 12/09/22
				</Text>
			</AutoLayout>

			{/* LINE  */}
			<AutoLayout
				name="line-seperator"
				overflow="visible"
				direction="vertical"
				spacing={12}
				padding={{
					vertical: 7,
					horizontal: 0,
				}}
				width="fill-parent"
			>
				<AutoLayout
					name="line"
					fill="#DADCE0"
					overflow="visible"
					direction="vertical"
					spacing={9}
					padding={4}
					width="fill-parent"
					height={1}
				/>
			</AutoLayout>

			{/* Info text */}
			<AutoLayout
				name="Info Text"
				overflow="visible"
				spacing={4}
				padding={{
					top: 0,
					right: 4,
					bottom: 4,
					left: 4,
				}}
				width="fill-parent"
			>
				<Text
					name="Disclaimer"
					opacity={0.7}
					fill="#808180"
					width="fill-parent"
					lineHeight={19}
					fontFamily="Inter"
					fontSize={13}
					letterSpacing={0.1}
				>
					Learn more how to use the widget here{''}
				</Text>
			</AutoLayout>

			{/* ACTION */}
			<AutoLayout
				name="Action"
				fill="#BDC1C6"
				cornerRadius={8}
				overflow="visible"
				spacing={4}
				padding={{
					vertical: 8,
					horizontal: 12,
				}}
				width="fill-parent"
			>
				<Text
					name="Create"
					fill="#FFF"
					width="fill-parent"
					verticalAlignText="center"
					horizontalAlignText="center"
					lineHeight={24}
					fontFamily="Inter"
					fontSize={13}
					letterSpacing={0.1}
					fontWeight={700}
				>
					Create
				</Text>
			</AutoLayout>
		</AutoLayout>
	);
}

widget.register(Widget);
